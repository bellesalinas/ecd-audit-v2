// Benchmarks every opportunity is measured against.
//
// FIRST-DRAFT VALUES: these are placeholder industry rules of thumb, not
// ECD's own benchmarks. v1 keeps ECD's in _shared/benchmarks.ts; copy those
// in before using this tool with a prospect. Every figure that depends on a
// benchmark is marked [VERIFY] in the numbers ledger until then.

export const BENCHMARK_SOURCE = "Placeholder rule of thumb (replace with ECD benchmarks)";

export interface CoreFlowSpec {
  key: string;
  label: string;
  /** Matches the flow name (case-insensitive). */
  namePattern: RegExp;
  /** Monthly flow revenue a healthy account earns, as a share of total store revenue. */
  shareOfStoreRevenue: number;
  fix: string;
}

export const benchmarks = {
  /** Share of store revenue a healthy DTC account attributes to email + SMS. */
  ownedChannelShare: 0.3,
  /** Campaign sends per week a healthy account runs. */
  campaignsPerWeek: 2,
  /** Each extra weekly campaign earns this share of today's average campaign (list fatigue). */
  extraCampaignYield: 0.7,
  /** Campaign click rate (unique clicks / delivered). */
  campaignClickRate: 0.012,
  /** Of the click-rate gap, the share of revenue lift we claim (conservative). */
  clickGapCaptureShare: 0.5,
  /** A live core flow earning below this share of its benchmark is underperforming. */
  underperformingFlowRatio: 0.5,
  deliverability: {
    bounceRate: 0.02,
    spamComplaintRate: 0.0008,
    unsubscribeRate: 0.005,
  },
  /** Below this many campaigns, subject-line patterns are observations, not trends. */
  minCampaignsForTrends: 20,
  /** Ignore subject lines sent to fewer people than this. */
  minSubjectRecipients: 1000,
};

export const coreFlows: CoreFlowSpec[] = [
  {
    key: "abandoned_checkout",
    label: "Abandoned checkout",
    namePattern: /abandon(ed)?[\s_-]*(checkout|cart)|checkout[\s_-]*abandon|cart[\s_-]*abandon/i,
    shareOfStoreRevenue: 0.025,
    fix: "Rebuild as a 3-email series over 72 hours with dynamic cart blocks and a split for first-time vs returning buyers.",
  },
  {
    key: "welcome",
    label: "Welcome series",
    namePattern: /welcome|new[\s_-]*subscriber|onboard/i,
    shareOfStoreRevenue: 0.015,
    fix: "Launch a 4-email welcome series that delivers the signup offer, tells the brand story and handles the top buying objections.",
  },
  {
    key: "browse_abandonment",
    label: "Browse abandonment",
    namePattern: /browse|viewed[\s_-]*product/i,
    shareOfStoreRevenue: 0.01,
    fix: "Add a 2-email browse abandonment flow triggered on Viewed Product, excluding anyone who started checkout.",
  },
  {
    key: "post_purchase",
    label: "Post-purchase",
    namePattern: /post[\s_-]*purchase|thank[\s_-]*you|after[\s_-]*purchase|customer[\s_-]*thank/i,
    shareOfStoreRevenue: 0.0075,
    fix: "Set a post-purchase flow live with usage tips, a review request and a timed cross-sell based on the first product bought.",
  },
  {
    key: "winback",
    label: "Winback",
    namePattern: /win[\s_-]*back|lapsed|re[\s_-]*engage|we[\s_-]*miss[\s_-]*you/i,
    shareOfStoreRevenue: 0.005,
    fix: "Add a winback flow timed to the brand's repeat-purchase window, with an escalating offer on the last email.",
  },
];
