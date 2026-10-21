import type { Ledger } from "../ledger.js";
import type { AccountSnapshot } from "../types.js";
import { describeRange, sum, toMonthly, weeksIn, weightedRate } from "./metrics.js";

export interface CampaignSummary {
  count: number;
  perWeek: number;
  revenue: number;
  monthlyRevenue: number;
  avgRevenuePerCampaign: number;
  clickRate: number;
  openRate: number;
  bounceRate: number;
  spamComplaintRate: number;
  unsubscribeRate: number;
}

export function analyseCampaigns(snapshot: AccountSnapshot, ledger: Ledger): CampaignSummary {
  const sent = snapshot.campaigns.filter((c) => c.recipients > 0);
  const range = describeRange(snapshot.messageWindow);
  const source = "campaign-values-reports, send_channel = email";

  const count = sent.length;
  const perWeek = count / weeksIn(snapshot.messageWindow);
  const revenue = sum(sent, (c) => c.revenue);
  const byRecipients = (m: { recipients: number }) => m.recipients;
  const summary: CampaignSummary = {
    count,
    perWeek,
    revenue,
    monthlyRevenue: toMonthly(revenue, snapshot.messageWindow),
    avgRevenuePerCampaign: count > 0 ? revenue / count : 0,
    clickRate: weightedRate(sent, (c) => c.clickRate),
    openRate: weightedRate(sent, (c) => c.openRate),
    bounceRate: weightedRate(sent, (c) => c.bounceRate, byRecipients),
    spamComplaintRate: weightedRate(sent, (c) => c.spamComplaintRate),
    unsubscribeRate: weightedRate(sent, (c) => c.unsubscribeRate),
  };

  ledger.add({ id: "camp.count", label: "Email campaigns sent", value: count, unit: "count", source, dateRange: range });
  ledger.add({ id: "camp.per_week", label: "Email campaigns per week", value: perWeek, unit: "per_week", source: "camp.count / weeks in window", dateRange: range });
  ledger.add({ id: "camp.revenue", label: "Campaign revenue", value: revenue, unit: "currency", source, dateRange: range });
  ledger.add({ id: "camp.monthly_revenue", label: "Campaign revenue per month", value: summary.monthlyRevenue, unit: "currency", source: "camp.revenue scaled to 30 days", dateRange: range });
  ledger.add({ id: "camp.avg_revenue", label: "Average revenue per campaign", value: summary.avgRevenuePerCampaign, unit: "currency", source: "camp.revenue / camp.count", dateRange: range });
  ledger.add({ id: "camp.click_rate", label: "Campaign click rate", value: summary.clickRate, unit: "percent", source, dateRange: range, notes: "Weighted by delivered. Open rate is not used for judgement (Apple Mail Privacy Protection inflates it)." });
  ledger.add({ id: "camp.open_rate", label: "Campaign open rate", value: summary.openRate, unit: "percent", source, dateRange: range, notes: "Inflated by Apple Mail Privacy Protection; context only." });
  ledger.add({ id: "camp.bounce_rate", label: "Campaign bounce rate", value: summary.bounceRate, unit: "percent", source, dateRange: range });
  ledger.add({ id: "camp.spam_rate", label: "Campaign spam complaint rate", value: summary.spamComplaintRate, unit: "percent", source, dateRange: range });
  ledger.add({ id: "camp.unsub_rate", label: "Campaign unsubscribe rate", value: summary.unsubscribeRate, unit: "percent", source, dateRange: range });

  return summary;
}
