import { Ledger } from "../ledger.js";
import type { AccountSnapshot, Opportunity } from "../types.js";
import { analyseCampaigns, type CampaignSummary } from "./campaigns.js";
import { analyseFlows, type CoreFlowHealth } from "./flows.js";
import { buildOpportunities } from "./opportunities.js";
import { analyseRevenue, type RevenueSplit } from "./revenue.js";
import { analyseSubjects, type SubjectInsights } from "./subjects.js";

export interface AuditResult {
  snapshot: AccountSnapshot;
  ledger: Ledger;
  revenue: RevenueSplit;
  flows: CoreFlowHealth[];
  campaigns: CampaignSummary;
  subjects: SubjectInsights;
  opportunities: Opportunity[];
  totalMonthlyOpportunity: number;
}

/** Pure: same snapshot in, same numbers out. */
export function analyse(snapshot: AccountSnapshot): AuditResult {
  const ledger = new Ledger();
  const revenue = analyseRevenue(snapshot, ledger);
  const flows = analyseFlows(snapshot, revenue.monthlyTotal, ledger);
  const campaigns = analyseCampaigns(snapshot, ledger);
  const subjects = analyseSubjects(snapshot, ledger);
  const opportunities = buildOpportunities({ snapshot, flows, campaigns, ledger });
  const totalMonthlyOpportunity = opportunities.reduce((t, o) => t + o.monthlyValue, 0);

  ledger.add({
    id: "opp.total_monthly",
    label: "Total monthly opportunity (opportunities in the deck)",
    value: totalMonthlyOpportunity,
    unit: "currency",
    source: "Sum of opp.*.monthly_value for the opportunities shown",
    dateRange: "n/a",
    verify: true,
    notes: "Levers can overlap; compare with rev.monthly_gap before quoting.",
  });

  return { snapshot, ledger, revenue, flows, campaigns, subjects, opportunities, totalMonthlyOpportunity };
}
