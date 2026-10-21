import { benchmarks } from "../benchmarks.js";
import type { Ledger } from "../ledger.js";
import type { AccountSnapshot, SubjectStats } from "../types.js";
import { describeRange, sum } from "./metrics.js";

// Feature 4: subject line trends. Judged on click rate, never opens
// (Apple Mail Privacy Protection makes opens unreliable).

export interface SubjectPattern {
  key: string;
  label: string;
  test: (subject: string) => boolean;
}

export const subjectPatterns: SubjectPattern[] = [
  { key: "emoji", label: "Contains an emoji", test: (s) => /\p{Extended_Pictographic}/u.test(s) },
  { key: "question", label: "Asks a question", test: (s) => s.includes("?") },
  { key: "number", label: "Contains a number or %", test: (s) => /\d|%/.test(s) },
  { key: "discount", label: "Leads with a discount or sale", test: (s) => /%\s*off|\bsale\b|\bsave\b|\bdiscount\b|\bfree\b/i.test(s) },
  { key: "urgency", label: "Uses urgency (last chance, ends, hours)", test: (s) => /last chance|ends|ending|final|hours left|today only|tonight/i.test(s) },
  { key: "short", label: "30 characters or fewer", test: (s) => [...s].length <= 30 },
];

export interface PatternResult {
  key: string;
  label: string;
  withCount: number;
  withoutCount: number;
  withClickRate: number;
  withoutClickRate: number;
  /** withClickRate / withoutClickRate - 1. */
  lift: number;
}

export interface SubjectInsights {
  /** "trends" when there are enough subjects to compare; otherwise only observations. */
  mode: "trends" | "observations";
  subjectCount: number;
  overallClickRate: number;
  patterns: PatternResult[];
  best: (SubjectStats & { clickRate: number })[];
  worst: (SubjectStats & { clickRate: number })[];
}

const clickRateOf = (rows: SubjectStats[]) => {
  const received = sum(rows, (r) => r.received);
  return received > 0 ? sum(rows, (r) => r.clicked) / received : 0;
};

export function analyseSubjects(snapshot: AccountSnapshot, ledger: Ledger): SubjectInsights {
  const rows = snapshot.subjects.filter((s) => s.received >= benchmarks.minSubjectRecipients);
  const range = describeRange(snapshot.messageWindow);
  const mode = rows.length >= benchmarks.minCampaignsForTrends ? "trends" : "observations";
  const overallClickRate = clickRateOf(rows);

  const patterns = subjectPatterns
    .map((p): PatternResult => {
      const withRows = rows.filter((r) => p.test(r.subject));
      const withoutRows = rows.filter((r) => !p.test(r.subject));
      const withClickRate = clickRateOf(withRows);
      const withoutClickRate = clickRateOf(withoutRows);
      return {
        key: p.key,
        label: p.label,
        withCount: withRows.length,
        withoutCount: withoutRows.length,
        withClickRate,
        withoutClickRate,
        lift: withoutClickRate > 0 ? withClickRate / withoutClickRate - 1 : 0,
      };
    })
    // A pattern needs a few subjects on each side before the comparison means anything.
    .filter((p) => p.withCount >= 3 && p.withoutCount >= 3)
    .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift));

  const ranked = rows
    .map((r) => ({ ...r, clickRate: r.received > 0 ? r.clicked / r.received : 0 }))
    .sort((a, b) => b.clickRate - a.clickRate);

  const source = "metric-aggregates: Received Email and Clicked Email (unique) by Subject";
  ledger.add({ id: "subj.count", label: "Subject lines analysed", value: rows.length, unit: "count", source, dateRange: range, notes: `Subjects with at least ${benchmarks.minSubjectRecipients} recipients; campaigns and flows.` });
  ledger.add({ id: "subj.click_rate", label: "Click rate across analysed subject lines", value: overallClickRate, unit: "percent", source, dateRange: range });
  for (const p of patterns) {
    ledger.add({
      id: `subj.${p.key}.lift`,
      label: `Click-rate lift: ${p.label}`,
      value: p.lift,
      unit: "percent",
      source,
      dateRange: range,
      notes: `${p.withCount} subjects with vs ${p.withoutCount} without; ${(p.withClickRate * 100).toFixed(2)}% vs ${(p.withoutClickRate * 100).toFixed(2)}%.`,
    });
  }

  return { mode, subjectCount: rows.length, overallClickRate, patterns, best: ranked.slice(0, 3), worst: ranked.slice(-3).reverse() };
}
