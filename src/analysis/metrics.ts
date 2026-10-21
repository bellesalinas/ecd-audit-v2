import type { DateRange, MessageStats } from "../types.js";

export function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

/** Rate across messages, weighted by each message's size. */
export function weightedRate(
  messages: MessageStats[],
  rate: (m: MessageStats) => number,
  weight: (m: MessageStats) => number = (m) => m.delivered,
): number {
  const totalWeight = sum(messages, weight);
  if (totalWeight === 0) return 0;
  return sum(messages, (m) => rate(m) * weight(m)) / totalWeight;
}

export function daysIn(range: DateRange): number {
  const ms = Date.parse(range.end) - Date.parse(range.start);
  return Math.max(1, Math.round(ms / 86_400_000));
}

export function weeksIn(range: DateRange): number {
  return daysIn(range) / 7;
}

/** Scales a total over the range to an average 30-day month. */
export function toMonthly(total: number, range: DateRange): number {
  return (total / daysIn(range)) * 30;
}

export function describeRange(range: DateRange): string {
  const end = new Date(Date.parse(range.end) - 86_400_000).toISOString().slice(0, 10);
  return `${range.start} to ${end}`;
}
