// Shared shapes. An AccountSnapshot is everything pulled from one Klaviyo
// account; every analysis reads only from it, so a saved snapshot can be
// re-analysed later without calling Klaviyo again.

export interface DateRange {
  start: string; // ISO date, inclusive
  end: string; // ISO date, exclusive
}

export interface ChannelRevenue {
  /** Value of $attributed_channel, lower-cased. "" means not attributed to any message. */
  channel: string;
  revenue: number;
  orders: number;
}

export interface MessageStats {
  id: string;
  name: string;
  recipients: number;
  delivered: number;
  openRate: number; // 0..1
  clickRate: number; // 0..1
  conversionRate: number; // 0..1
  revenue: number;
  revenuePerRecipient: number;
  unsubscribeRate: number; // 0..1
  spamComplaintRate: number; // 0..1
  bounceRate: number; // 0..1
}

export interface FlowSummary {
  id: string;
  name: string;
  /** Klaviyo flow status: "live", "manual" or "draft". */
  status: string;
  triggerType: string;
  messages: MessageStats[];
}

export interface SubjectStats {
  subject: string;
  received: number;
  clicked: number; // unique clickers
}

export interface AccountSnapshot {
  brand: string;
  currency: string;
  pulledAt: string; // ISO timestamp
  source: "klaviyo" | "demo";
  /** Window for the revenue split: the last 30 complete days. */
  revenueWindow: DateRange;
  /** Window for campaign, flow and subject-line stats. */
  messageWindow: DateRange;
  revenueByChannel: ChannelRevenue[];
  campaigns: MessageStats[];
  flows: FlowSummary[];
  subjects: SubjectStats[];
}

export type ImpactTag = "Revenue" | "Retention" | "Acquisition" | "Deliverability risk" | "Quick win";

export interface Opportunity {
  id: string;
  /** Headline with exactly one word wrapped in *asterisks* for the brand's italic emphasis. */
  headline: string;
  /** Estimated extra revenue per month. 0 for risk-only findings. */
  monthlyValue: number;
  impact: ImpactTag[];
  /** One sentence: what the data shows. */
  finding: string;
  /** Evidence lines, each tied to a ledger id. */
  evidence: { text: string; ledgerId: string }[];
  /** One line: what ECD would do. */
  fix: string;
  /** How the dollar estimate was made, for the strategist. */
  method: string;
}
