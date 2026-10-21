import { describe, expect, it } from "vitest";
import { KLAVIYO_REVISION, KlaviyoClient, KlaviyoError } from "../src/klaviyo/client.js";
import { channelName, completeDays, pickMetric, pullSnapshot, revenueRows, sumByDimension, toMessageStats } from "../src/klaviyo/pull.js";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const noWait = async () => {};

describe("KlaviyoClient", () => {
  it("sends the API key and revision header", async () => {
    let seen: Headers | undefined;
    const client = new KlaviyoClient("pk_test", async (_url, init) => {
      seen = new Headers(init?.headers);
      return json({ data: [] });
    });
    await client.getAll("/metrics");
    expect(seen?.get("authorization")).toBe("Klaviyo-API-Key pk_test");
    expect(seen?.get("revision")).toBe(KLAVIYO_REVISION);
  });

  it("retries a 429 using Retry-After", async () => {
    const waits: number[] = [];
    let calls = 0;
    const client = new KlaviyoClient(
      "pk_test",
      async () => (++calls === 1 ? json({ errors: [] }, 429, { "retry-after": "7" }) : json({ data: [] })),
      () => {},
      async (ms) => void waits.push(ms),
    );
    await client.getAll("/metrics");
    expect(calls).toBe(2);
    expect(waits).toEqual([7000]);
  });

  it("does not retry a 403 and reports the status", async () => {
    const client = new KlaviyoClient("pk_test", async () => json({ errors: [{ detail: "missing scope" }] }, 403), () => {}, noWait);
    await expect(client.getAll("/metrics")).rejects.toBeInstanceOf(KlaviyoError);
  });

  it("follows links.next across pages", async () => {
    const client = new KlaviyoClient("pk_test", async (url) =>
      String(url).includes("cursor")
        ? json({ data: [{ id: "2", type: "metric", attributes: {} }] })
        : json({ data: [{ id: "1", type: "metric", attributes: {} }], links: { next: "https://a.klaviyo.com/api/metrics?page[cursor]=x" } }),
    );
    expect((await client.getAll("/metrics")).map((r) => r.id)).toEqual(["1", "2"]);
  });
});

describe("pull helpers", () => {
  it("builds a window of whole UTC days", () => {
    expect(completeDays(new Date("2026-10-21T15:30:00Z"), 30)).toEqual({ start: "2026-09-21", end: "2026-10-21" });
  });

  it("sums aggregate buckets per dimension and treats nulls as zero", () => {
    const totals = sumByDimension(
      [
        { dimensions: ["email"], measurements: { sum_value: [100, null, 50] } },
        { dimensions: [""], measurements: { sum_value: [1000, 0, 0] } },
      ],
      "sum_value",
    );
    expect(totals.get("email")).toBe(150);
    expect(totals.get("")).toBe(1000);
  });

  it("maps values-report statistics onto MessageStats", () => {
    const stats = toMessageStats(
      { groupings: { campaign_message_id: "m1", campaign_message_name: "Spring" }, statistics: { recipients: 100, click_rate: 0.02, conversion_value: 500, bounce_rate: null } },
      "campaign_message_id",
      "campaign_message_name",
    );
    expect(stats).toMatchObject({ id: "m1", name: "Spring", recipients: 100, clickRate: 0.02, revenue: 500, bounceRate: 0 });
  });

  it("normalises Klaviyo's channel labels", () => {
    expect(channelName("$email_channel")).toBe("email");
    expect(channelName("$sms_channel")).toBe("sms");
    expect(channelName("Email")).toBe("email");
  });

  it("splits revenue into attributed channels plus the unattributed rest of the store", () => {
    const rows = revenueRows(
      new Map([["", 100_000]]),
      new Map([["", 900]]),
      new Map([["$email_channel", 30_000], ["$sms_channel", 5_000]]),
      new Map([["$email_channel", 200], ["$sms_channel", 40]]),
    );
    expect(rows).toEqual([
      { channel: "email", revenue: 30_000, orders: 200 },
      { channel: "sms", revenue: 5_000, orders: 40 },
      { channel: "", revenue: 65_000, orders: 660 },
    ]);
  });

  it("prefers the Shopify Placed Order metric when there are several", () => {
    const picked = pickMetric(
      [
        { id: "api", name: "Placed Order", integration: "API" },
        { id: "shop", name: "Placed Order", integration: "Shopify" },
      ],
      "Placed Order",
      ["Shopify"],
    );
    expect(picked.id).toBe("shop");
  });
});

describe("pullSnapshot", () => {
  it("turns Klaviyo responses into a snapshot", async () => {
    const posts: { url: string; body: any }[] = [];
    const fake = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") posts.push({ url, body: JSON.parse(String(init.body)) });
      if (url.endsWith("/accounts")) return json({ data: [{ id: "A", type: "account", attributes: { contact_information: { organization_name: "Acme" }, preferred_currency: "AUD" } }] });
      if (url.endsWith("/metrics"))
        return json({
          data: [
            { id: "PO", type: "metric", attributes: { name: "Placed Order", integration: { name: "Shopify" } } },
            { id: "RE", type: "metric", attributes: { name: "Received Email", integration: { name: "Klaviyo" } } },
            { id: "CE", type: "metric", attributes: { name: "Clicked Email", integration: { name: "Klaviyo" } } },
          ],
        });
      if (url.includes("/flows?"))
        return json({
          data: [
            { id: "F1", type: "flow", attributes: { name: "Welcome", status: "Live", trigger_type: "Added to List", archived: false } },
            { id: "F2", type: "flow", attributes: { name: "Old", status: "draft", trigger_type: "Metric", archived: true } },
          ],
        });
      if (url.endsWith("/metric-aggregates")) {
        const attrs = JSON.parse(String(init!.body)).data.attributes;
        if (attrs.metric_id === "PO") {
          const m = attrs.measurements[0];
          // Like the real API: grouped by channel, orders no message drove are left out.
          if (attrs.by) return json({ data: { attributes: { data: [{ dimensions: ["$email_channel"], measurements: { [m]: [10, 20] } }] } } });
          return json({ data: { attributes: { data: [{ dimensions: [], measurements: { [m]: [60, 40] } }] } } });
        }
        return json({ data: { attributes: { data: [{ dimensions: ["Hello"], measurements: { unique: [attrs.metric_id === "RE" ? 2000 : 40] } }] } } });
      }
      if (url.endsWith("/campaign-values-reports"))
        return json({ data: { attributes: { results: [{ groupings: { campaign_id: "C", campaign_message_id: "CM", campaign_message_name: "Hello" }, statistics: { recipients: 2000, conversion_value: 300 } }] } } });
      if (url.endsWith("/flow-values-reports"))
        return json({ data: { attributes: { results: [{ groupings: { flow_id: "F1", flow_message_id: "FM", flow_message_name: "W1" }, statistics: { recipients: 50, conversion_value: 90 } }] } } });
      return json({ errors: [{ detail: `unexpected ${url}` }] }, 404);
    };

    const snap = await pullSnapshot(new KlaviyoClient("pk_test", fake as typeof fetch), { today: new Date("2026-10-21T12:00:00Z") });

    expect(snap.brand).toBe("Acme");
    expect(snap.currency).toBe("AUD");
    expect(snap.revenueByChannel).toEqual([
      { channel: "email", revenue: 30, orders: 30 },
      { channel: "", revenue: 70, orders: 70 },
    ]);
    expect(snap.campaigns[0]).toMatchObject({ id: "CM", name: "Hello", revenue: 300 });
    expect(snap.flows).toHaveLength(1);
    expect(snap.flows[0]).toMatchObject({ name: "Welcome", status: "live" });
    expect(snap.flows[0]!.messages[0]).toMatchObject({ id: "FM", revenue: 90 });
    expect(snap.subjects).toEqual([{ subject: "Hello", received: 2000, clicked: 40 }]);

    const revenueCalls = posts.filter((p) => p.body.data.attributes.metric_id === "PO");
    expect(revenueCalls.filter((p) => p.body.data.attributes.by === undefined)).toHaveLength(2);
    const revenueCall = revenueCalls.find((p) => p.body.data.attributes.by)!;
    expect(revenueCall.body.data.attributes.by).toEqual(["$attributed_channel"]);
    expect(revenueCall.body.data.attributes.filter).toEqual(["greater-or-equal(datetime,2026-09-21T00:00:00)", "less-than(datetime,2026-10-21T00:00:00)"]);
    const campaignCall = posts.find((p) => p.url.endsWith("/campaign-values-reports"))!;
    expect(campaignCall.body.data.attributes.conversion_metric_id).toBe("PO");
  });
});
