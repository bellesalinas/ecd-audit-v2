import { BENCHMARK_SOURCE, benchmarks } from "../benchmarks.js";
import { money, percent } from "../format.js";
import type { Ledger } from "../ledger.js";
import type { AccountSnapshot, Opportunity } from "../types.js";
import type { CampaignSummary } from "./campaigns.js";
import type { CoreFlowHealth } from "./flows.js";
import { describeRange } from "./metrics.js";

export const MIN_OPPORTUNITIES = 4;
export const MAX_OPPORTUNITIES = 6;

interface Inputs {
  snapshot: AccountSnapshot;
  flows: CoreFlowHealth[];
  campaigns: CampaignSummary;
  ledger: Ledger;
}

function flowOpportunity(health: CoreFlowHealth, currency: string, ledger: Ledger, range: string): Opportunity | undefined {
  const { spec, flow, state, ledgerPrefix } = health;
  if (state === "healthy") return undefined;

  const value = Math.max(0, health.benchmarkMonthly - health.monthlyRevenue);
  ledger.add({
    id: `opp.${spec.key}.monthly_value`,
    label: `Opportunity: ${spec.label}`,
    value,
    unit: "currency",
    source: `${ledgerPrefix}.benchmark_monthly - ${ledgerPrefix}.monthly_revenue`,
    dateRange: range,
    verify: true,
  });
  const benchmarkLine = {
    text: `Benchmark for ${/^[aeiou]/i.test(spec.label) ? "an" : "a"} ${spec.label.toLowerCase()} flow at this revenue: ${money(health.benchmarkMonthly, currency)} a month`,
    ledgerId: `${ledgerPrefix}.benchmark_monthly`,
  };

  const byState = {
    missing: {
      headline: `There is no ${spec.label.toLowerCase()} flow *yet*`,
      finding: `No flow in the account matches a ${spec.label.toLowerCase()} flow, so that revenue is going uncaptured every month.`,
      evidence: [benchmarkLine],
    },
    not_live: {
      headline: `The ${spec.label.toLowerCase()} flow is built but *switched off*`,
      finding: `"${flow?.name}" exists but its status is ${flow?.status}, so it sends nothing.`,
      evidence: [{ text: `Revenue per month from "${flow?.name}": ${money(health.monthlyRevenue, currency)}`, ledgerId: `${ledgerPrefix}.monthly_revenue` }, benchmarkLine],
    },
    underperforming: {
      headline: `The ${spec.label.toLowerCase()} flow is *underperforming*`,
      finding: `"${flow?.name}" is live but earns ${percent(health.benchmarkMonthly > 0 ? health.monthlyRevenue / health.benchmarkMonthly : 0, 0)} of what a healthy ${spec.label.toLowerCase()} flow earns at this revenue.`,
      evidence: [
        { text: `Revenue per month from "${flow?.name}": ${money(health.monthlyRevenue, currency)}`, ledgerId: `${ledgerPrefix}.monthly_revenue` },
        benchmarkLine,
        { text: `Click rate: ${percent(health.clickRate, 2)}`, ledgerId: `${ledgerPrefix}.click_rate` },
      ],
    },
  }[state];

  return {
    id: `flow.${spec.key}`,
    headline: byState.headline,
    monthlyValue: value,
    impact: spec.key === "welcome" ? ["Revenue", "Acquisition"] : spec.key === "post_purchase" || spec.key === "winback" ? ["Revenue", "Retention"] : state === "not_live" ? ["Revenue", "Quick win"] : ["Revenue"],
    finding: byState.finding,
    evidence: byState.evidence,
    fix: spec.fix,
    method: `Benchmark monthly revenue (${(spec.shareOfStoreRevenue * 100).toFixed(2)}% of store revenue) minus what the flow earns today. ${BENCHMARK_SOURCE}.`,
  };
}

function cadenceOpportunity({ campaigns, ledger, snapshot }: Inputs, range: string): Opportunity | undefined {
  const target = benchmarks.campaignsPerWeek;
  if (campaigns.perWeek >= target || campaigns.count === 0) return undefined;
  const extraPerMonth = (target - campaigns.perWeek) * (30 / 7);
  const value = extraPerMonth * campaigns.avgRevenuePerCampaign * benchmarks.extraCampaignYield;
  ledger.add({ id: "opp.cadence.target", label: "Benchmark campaigns per week", value: target, unit: "per_week", source: BENCHMARK_SOURCE, dateRange: "n/a", verify: true });
  ledger.add({
    id: "opp.cadence.monthly_value",
    label: "Opportunity: campaign cadence",
    value,
    unit: "currency",
    source: `(target - camp.per_week) x 30/7 x camp.avg_revenue x ${benchmarks.extraCampaignYield} fatigue factor`,
    dateRange: range,
    verify: true,
  });
  return {
    id: "campaign.cadence",
    headline: `Campaigns go out too *rarely*`,
    monthlyValue: value,
    impact: ["Revenue", "Quick win"],
    finding: `The account sends ${campaigns.perWeek.toFixed(1)} campaigns a week; healthy accounts send ${target}, and each campaign here already earns ${money(campaigns.avgRevenuePerCampaign, snapshot.currency)} on average.`,
    evidence: [
      { text: `Campaigns per week: ${campaigns.perWeek.toFixed(1)}`, ledgerId: "camp.per_week" },
      { text: `Average revenue per campaign: ${money(campaigns.avgRevenuePerCampaign, snapshot.currency)}`, ledgerId: "camp.avg_revenue" },
      { text: `Benchmark: ${target} campaigns a week`, ledgerId: "opp.cadence.target" },
    ],
    fix: `Move to a ${target}-a-week calendar that alternates product-led and story-led sends, segmented by engagement so the extra sends don't hurt deliverability.`,
    method: `Extra campaigns a month x today's average campaign revenue x ${benchmarks.extraCampaignYield} to allow for list fatigue.`,
  };
}

function clickRateOpportunity({ campaigns, ledger, snapshot }: Inputs, range: string): Opportunity | undefined {
  const target = benchmarks.campaignClickRate;
  if (campaigns.count === 0 || campaigns.clickRate <= 0 || campaigns.clickRate >= target) return undefined;
  const lift = Math.min(1, target / campaigns.clickRate - 1);
  const value = campaigns.monthlyRevenue * lift * benchmarks.clickGapCaptureShare;
  ledger.add({ id: "opp.click.target", label: "Benchmark campaign click rate", value: target, unit: "percent", source: BENCHMARK_SOURCE, dateRange: "n/a", verify: true });
  ledger.add({
    id: "opp.click.monthly_value",
    label: "Opportunity: campaign click rate",
    value,
    unit: "currency",
    source: `camp.monthly_revenue x min(1, target/actual - 1) x ${benchmarks.clickGapCaptureShare}`,
    dateRange: range,
    verify: true,
  });
  return {
    id: "campaign.click_rate",
    headline: `Campaign content isn't earning the *click*`,
    monthlyValue: value,
    impact: ["Revenue"],
    finding: `Campaigns get a ${percent(campaigns.clickRate, 2)} click rate against a ${percent(target, 1)} benchmark, so fewer readers reach the site from every send.`,
    evidence: [
      { text: `Campaign click rate: ${percent(campaigns.clickRate, 2)}`, ledgerId: "camp.click_rate" },
      { text: `Benchmark click rate: ${percent(target, 1)}`, ledgerId: "opp.click.target" },
      { text: `Campaign revenue per month: ${money(campaigns.monthlyRevenue, snapshot.currency)}`, ledgerId: "camp.monthly_revenue" },
    ],
    fix: "Rework the campaign template around one offer and one primary call to action, and test subject lines against click rate rather than opens.",
    method: `Half of the revenue lift implied by closing the click-rate gap, capped at doubling campaign revenue.`,
  };
}

function deliverabilityOpportunity({ campaigns }: Inputs): Opportunity | undefined {
  const limits = benchmarks.deliverability;
  const problems: { text: string; ledgerId: string }[] = [];
  if (campaigns.bounceRate > limits.bounceRate) problems.push({ text: `Bounce rate ${percent(campaigns.bounceRate, 2)} (limit ${percent(limits.bounceRate, 1)})`, ledgerId: "camp.bounce_rate" });
  if (campaigns.spamComplaintRate > limits.spamComplaintRate) problems.push({ text: `Spam complaint rate ${percent(campaigns.spamComplaintRate, 3)} (limit ${percent(limits.spamComplaintRate, 2)})`, ledgerId: "camp.spam_rate" });
  if (campaigns.unsubscribeRate > limits.unsubscribeRate) problems.push({ text: `Unsubscribe rate ${percent(campaigns.unsubscribeRate, 2)} (limit ${percent(limits.unsubscribeRate, 1)})`, ledgerId: "camp.unsub_rate" });
  if (problems.length === 0) return undefined;
  return {
    id: "deliverability",
    headline: `Deliverability is putting the inbox at *risk*`,
    monthlyValue: 0,
    impact: ["Deliverability risk"],
    finding: `${problems.length} of 3 list-health measures are above the level inbox providers start filtering at.`,
    evidence: problems,
    fix: "Add an engaged-only sending segment, sunset profiles with no engagement in 180 days, and clean hard bounces before the next send.",
    method: "Risk finding; no dollar value claimed.",
  };
}

/** Builds every candidate, ranks by monthly value and keeps 4 to 6. */
export function buildOpportunities(inputs: Inputs): Opportunity[] {
  const range = describeRange(inputs.snapshot.messageWindow);
  const candidates = [
    ...inputs.flows.map((f) => flowOpportunity(f, inputs.snapshot.currency, inputs.ledger, range)),
    cadenceOpportunity(inputs, range),
    clickRateOpportunity(inputs, range),
    deliverabilityOpportunity(inputs),
  ].filter((o): o is Opportunity => o !== undefined);

  const valued = candidates.filter((o) => o.monthlyValue > 0).sort((a, b) => b.monthlyValue - a.monthlyValue);
  const riskOnly = candidates.filter((o) => o.monthlyValue <= 0);
  // Risk findings take any slots the dollar opportunities leave. An account with
  // fewer than MIN_OPPORTUNITIES findings gets a shorter deck rather than padding.
  return [...valued, ...riskOnly].slice(0, MAX_OPPORTUNITIES);
}
