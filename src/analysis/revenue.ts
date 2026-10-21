import { BENCHMARK_SOURCE, benchmarks } from "../benchmarks.js";
import type { Ledger } from "../ledger.js";
import type { AccountSnapshot } from "../types.js";
import { describeRange, sum, toMonthly } from "./metrics.js";

export interface RevenueSplit {
  total: number;
  monthlyTotal: number;
  email: number;
  sms: number;
  /** Revenue attributed to any Klaviyo channel (email, SMS, push). */
  owned: number;
  ownedShare: number;
  targetShare: number;
  /** Monthly revenue the account would add by reaching the target share. 0 when at or above it. */
  monthlyGap: number;
  orders: number;
}

// Same method as the /klaviyo-audit skill: Placed Order revenue grouped by
// $attributed_channel over the last 30 complete days. Keep the two in step,
// or one prospect can get two different headline numbers from ECD.
export function analyseRevenue(snapshot: AccountSnapshot, ledger: Ledger): RevenueSplit {
  const rows = snapshot.revenueByChannel;
  const range = describeRange(snapshot.revenueWindow);
  const source = "metric-aggregates: Placed Order sum_value, total and by $attributed_channel";

  const total = sum(rows, (r) => r.revenue);
  const orders = sum(rows, (r) => r.orders);
  const email = sum(rows.filter((r) => r.channel === "email"), (r) => r.revenue);
  const sms = sum(rows.filter((r) => r.channel === "sms"), (r) => r.revenue);
  const owned = sum(rows.filter((r) => r.channel !== ""), (r) => r.revenue);
  const ownedShare = total > 0 ? owned / total : 0;
  const monthlyTotal = toMonthly(total, snapshot.revenueWindow);
  const targetShare = benchmarks.ownedChannelShare;
  const monthlyGap = Math.max(0, targetShare - ownedShare) * monthlyTotal;

  ledger.add({ id: "rev.total", label: "Total store revenue", value: total, unit: "currency", source, dateRange: range });
  ledger.add({ id: "rev.orders", label: "Orders", value: orders, unit: "count", source, dateRange: range });
  ledger.add({ id: "rev.email", label: "Email-attributed revenue", value: email, unit: "currency", source, dateRange: range });
  ledger.add({ id: "rev.sms", label: "SMS-attributed revenue", value: sms, unit: "currency", source, dateRange: range });
  ledger.add({
    id: "rev.owned_share",
    label: "Share of revenue from Klaviyo channels",
    value: ownedShare,
    unit: "percent",
    source: "rev.owned / rev.total",
    dateRange: range,
    notes: "Owned = every non-empty $attributed_channel (email, SMS, push).",
  });
  ledger.add({
    id: "rev.target_share",
    label: "Benchmark share of revenue from Klaviyo channels",
    value: targetShare,
    unit: "percent",
    source: BENCHMARK_SOURCE,
    dateRange: "n/a",
    verify: true,
  });
  ledger.add({
    id: "rev.monthly_gap",
    label: "Monthly revenue gap to benchmark share",
    value: monthlyGap,
    unit: "currency",
    source: "(target share - owned share) x monthly store revenue",
    dateRange: range,
    verify: true,
  });

  return { total, monthlyTotal, email, sms, owned, ownedShare, targetShare, monthlyGap, orders };
}
