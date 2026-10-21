import type { AccountSnapshot, ChannelRevenue, DateRange, FlowSummary, MessageStats, SubjectStats } from "../types.js";
import type { KlaviyoClient } from "./client.js";

// Pulls everything one audit needs into an AccountSnapshot. Calls, in order:
//   GET  /accounts                 brand name, currency, timezone
//   GET  /metrics                  ids for Placed Order, Received Email, Clicked Email
//   POST /metric-aggregates x4     store revenue and orders, total and by $attributed_channel (last 30 complete days)
//   POST /campaign-values-reports  email campaign stats (90 days)
//   GET  /flows                    flow names, status, trigger
//   POST /flow-values-reports      email flow message stats (90 days)
//   POST /metric-aggregates x2     receipts and unique clicks by Subject (90 days)
// The two values reports are limited to 2 calls a minute and 225 a day per account.

export const REVENUE_DAYS = 30;
export const MESSAGE_DAYS = 90;

const STATISTICS = [
  "recipients",
  "delivered",
  "open_rate",
  "click_rate",
  "conversion_rate",
  "conversion_value",
  "revenue_per_recipient",
  "unsubscribe_rate",
  "spam_complaint_rate",
  "bounce_rate",
] as const;

interface ValuesRow {
  groupings: Record<string, string>;
  statistics: Record<string, number | null>;
}

interface AggregateRow {
  dimensions: string[];
  measurements: Record<string, (number | null)[]>;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Window of whole UTC days ending at the start of `today`. */
export function completeDays(today: Date, days: number): DateRange {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end.getTime() - days * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function toMessageStats(row: ValuesRow, idKey: string, nameKey: string): MessageStats {
  const s = row.statistics;
  return {
    id: row.groupings[idKey] ?? "",
    name: row.groupings[nameKey] ?? row.groupings[idKey] ?? "",
    recipients: num(s.recipients),
    delivered: num(s.delivered),
    openRate: num(s.open_rate),
    clickRate: num(s.click_rate),
    conversionRate: num(s.conversion_rate),
    revenue: num(s.conversion_value),
    revenuePerRecipient: num(s.revenue_per_recipient),
    unsubscribeRate: num(s.unsubscribe_rate),
    spamComplaintRate: num(s.spam_complaint_rate),
    bounceRate: num(s.bounce_rate),
  };
}

/** Sums each dimension's measurement across all date buckets. */
export function sumByDimension(rows: AggregateRow[], measurement: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row.dimensions[0] ?? "";
    const value = (row.measurements[measurement] ?? []).reduce<number>((t, v) => t + num(v), 0);
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  return totals;
}

/** Klaviyo labels channels "$email_channel", "$sms_channel"; reduce to "email", "sms". */
export function channelName(label: string): string {
  return label.toLowerCase().replace(/^\$/, "").replace(/_channel$/, "");
}

/**
 * Attributed channel rows plus one "" row for the rest of the store. Grouping
 * by $attributed_channel drops orders no message drove, so the store total
 * comes from a separate ungrouped query.
 */
export function revenueRows(
  totalRevenue: Map<string, number>,
  totalOrders: Map<string, number>,
  byChannelRevenue: Map<string, number>,
  byChannelOrders: Map<string, number>,
): ChannelRevenue[] {
  const rows: ChannelRevenue[] = [];
  for (const [label, revenue] of byChannelRevenue) {
    const channel = channelName(label);
    if (channel === "") continue;
    rows.push({ channel, revenue, orders: byChannelOrders.get(label) ?? 0 });
  }
  const sumOf = (m: Map<string, number>) => [...m.values()].reduce((t, v) => t + v, 0);
  const attributedRevenue = rows.reduce((t, r) => t + r.revenue, 0);
  const attributedOrders = rows.reduce((t, r) => t + r.orders, 0);
  rows.push({
    channel: "",
    revenue: Math.max(0, sumOf(totalRevenue) - attributedRevenue),
    orders: Math.max(0, sumOf(totalOrders) - attributedOrders),
  });
  return rows;
}

interface MetricRef {
  id: string;
  name: string;
  integration: string;
}

export function pickMetric(metrics: MetricRef[], name: string, preferIntegrations: string[] = []): MetricRef {
  const matches = metrics.filter((m) => m.name === name);
  if (matches.length === 0) throw new Error(`The account has no "${name}" metric`);
  for (const integration of preferIntegrations) {
    const hit = matches.find((m) => m.integration.toLowerCase() === integration.toLowerCase());
    if (hit) return hit;
  }
  return matches[0]!;
}

export async function pullSnapshot(client: KlaviyoClient, opts: { today?: Date; brand?: string; log?: (line: string) => void } = {}): Promise<AccountSnapshot> {
  const log = opts.log ?? (() => {});
  const today = opts.today ?? new Date();
  const revenueWindow = completeDays(today, REVENUE_DAYS);
  const messageWindow = completeDays(today, MESSAGE_DAYS);
  const datetimeFilter = (r: DateRange) => [`greater-or-equal(datetime,${r.start}T00:00:00)`, `less-than(datetime,${r.end}T00:00:00)`];
  const timeframe = (r: DateRange) => ({ start: `${r.start}T00:00:00+00:00`, end: `${r.end}T00:00:00+00:00` });

  log("Reading account details");
  const accounts = await client.getAll("/accounts");
  const account = (accounts[0]?.attributes ?? {}) as {
    contact_information?: { organization_name?: string };
    preferred_currency?: string;
  };

  log("Finding metrics");
  const metrics: MetricRef[] = (await client.getAll("/metrics")).map((m) => ({
    id: m.id,
    name: String(m.attributes.name ?? ""),
    integration: String((m.attributes.integration as { name?: string } | undefined)?.name ?? ""),
  }));
  const placedOrder = pickMetric(metrics, "Placed Order", ["Shopify", "WooCommerce", "BigCommerce", "Magento"]);
  const received = pickMetric(metrics, "Received Email", ["Klaviyo"]);
  const clicked = pickMetric(metrics, "Clicked Email", ["Klaviyo"]);

  const aggregate = async (metricId: string, measurement: string, by: string | undefined, range: DateRange) => {
    const body = {
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          measurements: [measurement],
          interval: "month",
          ...(by ? { by: [by] } : {}),
          filter: datetimeFilter(range),
          timezone: "UTC",
          page_size: 500,
        },
      },
    };
    const res = await client.request<{ data: { attributes: { data: AggregateRow[] } } }>("POST", "/metric-aggregates", body);
    return sumByDimension(res.data.attributes.data, measurement);
  };

  log("Pulling store revenue and revenue by attributed channel (last 30 complete days)");
  const placed = (measurement: string, by?: string) => aggregate(placedOrder.id, measurement, by, revenueWindow);
  const revenueByChannel = revenueRows(
    await placed("sum_value"),
    await placed("count"),
    await placed("sum_value", "$attributed_channel"),
    await placed("count", "$attributed_channel"),
  );

  const valuesReport = async (type: "campaign-values-report" | "flow-values-report", path: string, groupBy: string[]) => {
    const body = {
      data: {
        type,
        attributes: { statistics: STATISTICS, timeframe: timeframe(messageWindow), conversion_metric_id: placedOrder.id, group_by: groupBy, filter: 'equals(send_channel,"email")' },
      },
    };
    const res = await client.request<{ data: { attributes: { results: ValuesRow[] } } }>("POST", path, body);
    return res.data.attributes.results;
  };

  log("Pulling campaign performance (90 days; this report is rate limited)");
  const campaignRows = await valuesReport("campaign-values-report", "/campaign-values-reports", ["campaign_id", "campaign_message_id", "campaign_message_name", "send_channel"]);
  const campaigns = campaignRows.map((r) => toMessageStats(r, "campaign_message_id", "campaign_message_name"));

  log("Reading flows");
  const flowResources = await client.getAll("/flows?fields[flow]=name,status,trigger_type,archived");
  log("Pulling flow performance (90 days; this report is rate limited)");
  const flowRows = await valuesReport("flow-values-report", "/flow-values-reports", ["flow_id", "flow_message_id", "flow_message_name", "send_channel"]);
  const flows: FlowSummary[] = flowResources
    .filter((f) => f.attributes.archived !== true)
    .map((f) => ({
      id: f.id,
      name: String(f.attributes.name ?? ""),
      status: String(f.attributes.status ?? "").toLowerCase(),
      triggerType: String(f.attributes.trigger_type ?? ""),
      messages: flowRows.filter((r) => r.groupings.flow_id === f.id).map((r) => toMessageStats(r, "flow_message_id", "flow_message_name")),
    }));

  log("Pulling subject lines (90 days)");
  const receivedBySubject = await aggregate(received.id, "unique", "Subject", messageWindow);
  const clickedBySubject = await aggregate(clicked.id, "unique", "Subject", messageWindow);
  const subjects: SubjectStats[] = [...receivedBySubject.entries()]
    .filter(([subject]) => subject.trim() !== "")
    .map(([subject, count]) => ({ subject, received: count, clicked: clickedBySubject.get(subject) ?? 0 }));

  return {
    brand: opts.brand ?? account.contact_information?.organization_name ?? "Unnamed account",
    currency: account.preferred_currency ?? "USD",
    pulledAt: new Date().toISOString(),
    source: "klaviyo",
    revenueWindow,
    messageWindow,
    revenueByChannel,
    campaigns,
    flows,
    subjects,
  };
}
