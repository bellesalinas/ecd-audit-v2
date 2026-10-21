import { BENCHMARK_SOURCE, benchmarks, coreFlows, type CoreFlowSpec } from "../benchmarks.js";
import type { Ledger } from "../ledger.js";
import type { AccountSnapshot, FlowSummary } from "../types.js";
import { describeRange, sum, toMonthly, weightedRate } from "./metrics.js";

export type FlowState = "missing" | "not_live" | "underperforming" | "healthy";

export interface CoreFlowHealth {
  spec: CoreFlowSpec;
  /** The best matching flow, or undefined when none exists. */
  flow?: FlowSummary;
  state: FlowState;
  monthlyRevenue: number;
  benchmarkMonthly: number;
  recipients: number;
  clickRate: number;
  ledgerPrefix: string;
}

function flowRevenue(flow: FlowSummary): number {
  return sum(flow.messages, (m) => m.revenue);
}

/** Picks the flow for a core type: name match, live first, then highest revenue. */
export function matchFlow(flows: FlowSummary[], spec: CoreFlowSpec): FlowSummary | undefined {
  const candidates = flows.filter((f) => spec.namePattern.test(f.name));
  return candidates.sort((a, b) => {
    const live = Number(b.status === "live") - Number(a.status === "live");
    return live !== 0 ? live : flowRevenue(b) - flowRevenue(a);
  })[0];
}

export function analyseFlows(snapshot: AccountSnapshot, monthlyStoreRevenue: number, ledger: Ledger): CoreFlowHealth[] {
  const range = describeRange(snapshot.messageWindow);
  const source = "flow-values-reports grouped by flow_id, flow_message_id";

  return coreFlows.map((spec) => {
    const flow = matchFlow(snapshot.flows, spec);
    const prefix = `flow.${spec.key}`;
    const benchmarkMonthly = spec.shareOfStoreRevenue * monthlyStoreRevenue;
    const monthlyRevenue = flow ? toMonthly(flowRevenue(flow), snapshot.messageWindow) : 0;
    const recipients = flow ? sum(flow.messages, (m) => m.recipients) : 0;
    const clickRate = flow ? weightedRate(flow.messages, (m) => m.clickRate) : 0;

    let state: FlowState;
    if (!flow) state = "missing";
    else if (flow.status !== "live") state = "not_live";
    else if (monthlyRevenue < benchmarks.underperformingFlowRatio * benchmarkMonthly) state = "underperforming";
    else state = "healthy";

    ledger.add({
      id: `${prefix}.monthly_revenue`,
      label: `${spec.label}: revenue per month`,
      value: monthlyRevenue,
      unit: "currency",
      source: flow ? source : "No matching flow found by name",
      dateRange: range,
      notes: flow ? `Matched flow "${flow.name}" (status ${flow.status}). 90-day total scaled to 30 days.` : "",
    });
    ledger.add({
      id: `${prefix}.benchmark_monthly`,
      label: `${spec.label}: benchmark revenue per month`,
      value: benchmarkMonthly,
      unit: "currency",
      source: `${BENCHMARK_SOURCE}: ${(spec.shareOfStoreRevenue * 100).toFixed(2)}% of monthly store revenue`,
      dateRange: range,
      verify: true,
    });
    if (flow) {
      ledger.add({ id: `${prefix}.recipients`, label: `${spec.label}: recipients`, value: recipients, unit: "count", source, dateRange: range });
      ledger.add({ id: `${prefix}.click_rate`, label: `${spec.label}: click rate`, value: clickRate, unit: "percent", source, dateRange: range, notes: "Weighted by delivered." });
    }

    return { spec, flow, state, monthlyRevenue, benchmarkMonthly, recipients, clickRate, ledgerPrefix: prefix };
  });
}
