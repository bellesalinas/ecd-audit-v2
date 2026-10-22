import type { AccountSnapshot, MessageStats } from "../types.js";

// A made-up account for demos and tests. It is built to show every kind of
// finding: an underperforming abandoned checkout, a missing browse flow, a
// post-purchase flow left in manual, low cadence and a weak click rate.

export function msg(id: string, name: string, recipients: number, clickRate: number, revenue: number, extra: Partial<MessageStats> = {}): MessageStats {
  const delivered = Math.round(recipients * 0.985);
  return {
    id,
    name,
    recipients,
    delivered,
    openRate: 0.42,
    clickRate,
    conversionRate: clickRate * 0.12,
    revenue,
    revenuePerRecipient: recipients > 0 ? revenue / recipients : 0,
    unsubscribeRate: 0.0031,
    spamComplaintRate: 0.0004,
    bounceRate: 0.009,
    ...extra,
  };
}

const subjects: [string, number, number][] = [
  ["New arrivals are here", 48000, 470],
  ["Last chance: 20% off ends tonight", 51000, 790],
  ["Our founder's favourite piece", 47000, 520],
  ["🌸 Spring edit, just for you", 49500, 610],
  ["Did you see this?", 46000, 560],
  ["The bestsellers are back", 50500, 505],
  ["Free shipping this weekend only", 52000, 700],
  ["How to style the linen set", 45500, 410],
  ["✨ 3 ways to wear it", 48800, 640],
  ["Restocked: the one you asked for", 50200, 600],
  ["Sale: save 30% sitewide", 53000, 820],
  ["A note from our studio", 44000, 330],
  ["What's your summer colour?", 47300, 590],
  ["Weekend reading", 43800, 300],
  ["Back in stock", 51800, 540],
  ["Final hours: 25% off", 52500, 780],
  ["Meet the new collection", 49000, 480],
  ["☀️ Summer starts now", 50000, 650],
  ["Care guide: make it last", 42500, 320],
  ["5 pieces under $50", 48200, 610],
  ["Thanks for being here", 41000, 280],
  ["Ready for the weekend?", 46700, 575],
  ["Our most-loved dress", 49900, 505],
  ["Ends today: gift with purchase", 50800, 720],
];

export function demoSnapshot(): AccountSnapshot {
  return {
    brand: "Demo Brand Co.",
    currency: "USD",
    pulledAt: "2026-10-21T09:00:00.000Z",
    source: "demo",
    revenueWindow: { start: "2026-09-21", end: "2026-10-21" },
    messageWindow: { start: "2026-07-23", end: "2026-10-21" },
    revenueByChannel: [
      { channel: "", revenue: 337_600, orders: 4_220 },
      { channel: "email", revenue: 61_200, orders: 765 },
      { channel: "sms", revenue: 13_200, orders: 165 },
    ],
    campaigns: subjects.slice(0, 14).map(([subject, recipients], i) =>
      msg(`C${i + 1}`, subject, recipients, 0.0085 + (i % 4) * 0.0005, 6_400 + (i % 5) * 900),
    ),
    flows: [
      {
        id: "F1",
        name: "Welcome Series - Email",
        status: "live",
        triggerType: "Added to List",
        messages: [
          msg("F1M1", "Welcome 1", 9_800, 0.061, 9_500),
          msg("F1M2", "Welcome 2", 8_900, 0.028, 4_100),
          msg("F1M3", "Welcome 3", 8_300, 0.021, 2_700),
        ],
      },
      {
        id: "F2",
        name: "Abandoned Checkout",
        status: "live",
        triggerType: "Metric",
        messages: [msg("F2M1", "Checkout reminder", 7_400, 0.044, 12_300)],
      },
      {
        id: "F3",
        name: "Post Purchase Thank You",
        status: "manual",
        triggerType: "Metric",
        messages: [msg("F3M1", "Thank you", 0, 0, 0)],
      },
      {
        id: "F4",
        name: "Winback 90 days",
        status: "live",
        triggerType: "Metric",
        messages: [msg("F4M1", "We miss you", 6_100, 0.019, 7_900)],
      },
    ],
    subjects: subjects.map(([subject, received, clicked]) => ({ subject, received, clicked })),
  };
}
