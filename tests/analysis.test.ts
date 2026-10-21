import { describe, expect, it } from "vitest";
import { analyse } from "../src/analysis/index.js";
import { matchFlow } from "../src/analysis/flows.js";
import { coreFlows } from "../src/benchmarks.js";
import { demoSnapshot } from "../src/demo/fixture.js";
import type { AccountSnapshot } from "../src/types.js";

const spec = (key: string) => coreFlows.find((f) => f.key === key)!;

describe("revenue split", () => {
  it("computes owned share from attributed channels only", () => {
    const { revenue } = analyse(demoSnapshot());
    expect(revenue.total).toBe(412_000);
    expect(revenue.email).toBe(61_200);
    expect(revenue.sms).toBe(13_200);
    expect(revenue.ownedShare).toBeCloseTo(74_400 / 412_000, 6);
    expect(revenue.monthlyGap).toBeCloseTo((0.3 - 74_400 / 412_000) * 412_000, 2);
  });

  it("reports no gap when the account is above the benchmark share", () => {
    const snap = demoSnapshot();
    snap.revenueByChannel = [
      { channel: "", revenue: 60_000, orders: 1 },
      { channel: "email", revenue: 40_000, orders: 1 },
    ];
    expect(analyse(snap).revenue.monthlyGap).toBe(0);
  });
});

describe("core flows", () => {
  it("classifies each core flow in the demo account", () => {
    const states = Object.fromEntries(analyse(demoSnapshot()).flows.map((f) => [f.spec.key, f.state]));
    expect(states).toEqual({
      abandoned_checkout: "underperforming",
      welcome: "healthy",
      browse_abandonment: "missing",
      post_purchase: "not_live",
      winback: "healthy",
    });
  });

  it("prefers a live flow over a draft with the same type", () => {
    const flows = [
      { id: "a", name: "Abandoned Cart OLD", status: "draft", triggerType: "Metric", messages: [] },
      { id: "b", name: "Abandoned Cart v2", status: "live", triggerType: "Metric", messages: [] },
    ];
    expect(matchFlow(flows, spec("abandoned_checkout"))?.id).toBe("b");
  });

  it("does not mistake a checkout flow for a welcome flow", () => {
    const flows = [{ id: "a", name: "Checkout Abandonment", status: "live", triggerType: "Metric", messages: [] }];
    expect(matchFlow(flows, spec("welcome"))).toBeUndefined();
    expect(matchFlow(flows, spec("abandoned_checkout"))?.id).toBe("a");
  });
});

describe("campaigns", () => {
  it("measures cadence over the message window", () => {
    const { campaigns } = analyse(demoSnapshot());
    expect(campaigns.count).toBe(14);
    expect(campaigns.perWeek).toBeCloseTo(14 / (90 / 7), 6);
  });

  it("ignores campaigns with no recipients", () => {
    const snap = demoSnapshot();
    snap.campaigns[0]!.recipients = 0;
    expect(analyse(snap).campaigns.count).toBe(13);
  });
});

describe("subject lines", () => {
  it("runs as trends with 20+ subjects and as observations below that", () => {
    expect(analyse(demoSnapshot()).subjects.mode).toBe("trends");
    const snap = demoSnapshot();
    snap.subjects = snap.subjects.slice(0, 10);
    expect(analyse(snap).subjects.mode).toBe("observations");
  });

  it("finds that discount subjects out-click the rest in the demo data", () => {
    const discount = analyse(demoSnapshot()).subjects.patterns.find((p) => p.key === "discount");
    expect(discount).toBeDefined();
    expect(discount!.lift).toBeGreaterThan(0.2);
  });
});

describe("opportunities", () => {
  it("ranks dollar opportunities by value and keeps at most six", () => {
    const { opportunities } = analyse(demoSnapshot());
    expect(opportunities.length).toBeGreaterThanOrEqual(4);
    expect(opportunities.length).toBeLessThanOrEqual(6);
    const values = opportunities.filter((o) => o.monthlyValue > 0).map((o) => o.monthlyValue);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("gives every headline exactly one italic word", () => {
    for (const o of analyse(demoSnapshot()).opportunities) {
      expect(o.headline.match(/\*[^*]+\*/g), o.headline).toHaveLength(1);
    }
  });

  it("ties every evidence line to a ledger entry", () => {
    const result = analyse(demoSnapshot());
    for (const o of result.opportunities) {
      for (const e of o.evidence) expect(result.ledger.has(e.ledgerId), e.ledgerId).toBe(true);
    }
  });

  it("puts a deliverability risk in the deck when list health is poor", () => {
    const snap = demoSnapshot();
    snap.campaigns = snap.campaigns.map((c) => ({ ...c, spamComplaintRate: 0.002 }));
    const risk = analyse(snap).opportunities.find((o) => o.id === "deliverability");
    expect(risk?.monthlyValue).toBe(0);
  });

  it("is deterministic", () => {
    const a = analyse(demoSnapshot());
    const b = analyse(demoSnapshot());
    expect(a.ledger.all()).toEqual(b.ledger.all());
  });
});

describe("empty account", () => {
  it("does not crash or divide by zero", () => {
    const empty: AccountSnapshot = { ...demoSnapshot(), revenueByChannel: [], campaigns: [], flows: [], subjects: [] };
    const result = analyse(empty);
    expect(result.revenue.ownedShare).toBe(0);
    expect(Number.isFinite(result.totalMonthlyOpportunity)).toBe(true);
    for (const entry of result.ledger.all()) expect(Number.isFinite(entry.value), entry.id).toBe(true);
  });
});
