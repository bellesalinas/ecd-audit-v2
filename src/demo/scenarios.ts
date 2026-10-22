import type { AccountSnapshot } from "../types.js";
import { demoSnapshot, msg } from "./fixture.js";

// Made-up accounts for testing the tool. Each one shows a different shape
// of result, so reviewers can see how the ranking behaves.

export interface Scenario {
  id: string;
  label: string;
  description: string;
  snapshot: () => AccountSnapshot;
}

/** Every core flow exists and earns well; the gap is overall share and list health. */
export function healthyClientSnapshot(): AccountSnapshot {
  const base = demoSnapshot();
  const subjects = [
    "The autumn edit is live", "Our best-selling boot is back", "Last chance: 15% off ends tonight", "How we make it",
    "🍂 New colours just dropped", "Your weekend reading", "Back in stock: the cashmere crew", "Free shipping ends Sunday",
    "3 ways to layer this season", "Meet the makers", "Sale: up to 40% off", "The gift guide is here",
    "Did you see these?", "Final hours: members' sale", "Care guide: wool", "New: the travel collection",
    "Customer favourites", "What's your size?", "Ends today: double points", "A note from our founder",
    "Restocked and ready", "⭐ Rated 5 stars by 2,000 customers", "Just for members", "Cold weather essentials",
    "Our most-returned-to piece", "The last drop of the year", "Thank you for 10 years", "Early access starts now",
    "Wrap it up", "One week only",
  ];
  return {
    ...base,
    brand: "Northwind Outfitters",
    revenueByChannel: [
      { channel: "", revenue: 406_000, orders: 4_800 },
      { channel: "email", revenue: 96_000, orders: 1_130 },
      { channel: "sms", revenue: 18_000, orders: 210 },
    ],
    campaigns: subjects.map((subject, i) =>
      msg(`C${i + 1}`, subject, 62_000 + (i % 6) * 1_500, 0.014 + (i % 3) * 0.002, 3_100 + (i % 4) * 500, { unsubscribeRate: 0.0068 }),
    ),
    flows: [
      { id: "F1", name: "Welcome Series", status: "live", triggerType: "Added to List", messages: [msg("F1M1", "Welcome 1", 14_000, 0.07, 16_000), msg("F1M2", "Welcome 2", 12_500, 0.035, 11_000)] },
      { id: "F2", name: "Abandoned Checkout", status: "live", triggerType: "Metric", messages: [msg("F2M1", "Reminder", 9_800, 0.09, 30_000), msg("F2M2", "Last call", 7_900, 0.06, 15_500)] },
      { id: "F3", name: "Browse Abandonment", status: "live", triggerType: "Metric", messages: [msg("F3M1", "Still looking?", 18_000, 0.05, 17_500)] },
      { id: "F4", name: "Post-Purchase", status: "live", triggerType: "Metric", messages: [msg("F4M1", "Thank you", 9_000, 0.04, 6_000), msg("F4M2", "How to care for it", 8_400, 0.03, 7_200)] },
      { id: "F5", name: "Winback", status: "live", triggerType: "Metric", messages: [msg("F5M1", "We miss you", 11_000, 0.025, 8_900)] },
    ],
    subjects: subjects.map((subject, i) => {
      const received = 62_000 + (i % 6) * 1_500;
      const lift = /%|sale|off|free|points/i.test(subject) ? 1.35 : 1;
      return { subject, received, clicked: Math.round(received * (0.014 + (i % 3) * 0.002) * lift) };
    }),
  };
}

/** A young store: few campaigns, missing flows, too few subject lines for trends. */
export function smallStoreSnapshot(): AccountSnapshot {
  const base = demoSnapshot();
  const subjects = ["Welcome to the shop", "New candles are here", "20% off this weekend", "Our story", "Holiday gift ideas", "Last chance: 20% off"];
  return {
    ...base,
    brand: "Juniper & Wick",
    revenueByChannel: [
      { channel: "", revenue: 33_900, orders: 610 },
      { channel: "email", revenue: 4_100, orders: 74 },
    ],
    campaigns: subjects.map((subject, i) => msg(`C${i + 1}`, subject, 3_200 + i * 150, 0.016 + (i % 2) * 0.003, 520 + i * 60)),
    flows: [
      { id: "F1", name: "Welcome email", status: "live", triggerType: "Added to List", messages: [msg("F1M1", "Welcome", 1_900, 0.06, 1_200)] },
      { id: "F2", name: "Abandoned Cart", status: "live", triggerType: "Metric", messages: [msg("F2M1", "You left something", 600, 0.05, 300)] },
    ],
    subjects: subjects.map((subject, i) => {
      const received = 3_200 + i * 150;
      return { subject, received, clicked: Math.round(received * (0.016 + (i % 2) * 0.003)) };
    }),
  };
}

export const scenarios: Scenario[] = [
  { id: "demo", label: "Demo Brand Co.", description: "Mid-size brand with a bit of everything: a weak checkout flow, missing flows, low cadence.", snapshot: demoSnapshot },
  { id: "healthy", label: "Northwind Outfitters", description: "Existing-client shape: every core flow is healthy, but email's share is still below benchmark and unsubscribes are high.", snapshot: healthyClientSnapshot },
  { id: "small", label: "Juniper & Wick", description: "Young store: 6 campaigns in 90 days, three core flows missing, too few subject lines for trends.", snapshot: smallStoreSnapshot },
];
