import type { LedgerEntry } from "./ledger.js";

export function money(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function count(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatEntry(entry: LedgerEntry, currency: string): string {
  switch (entry.unit) {
    case "currency":
      return money(entry.value, currency);
    case "percent":
      return percent(entry.value, Math.abs(entry.value) < 0.01 ? 2 : 1);
    case "per_week":
      return `${entry.value.toFixed(1)} per week`;
    case "ratio":
      return entry.value.toFixed(2);
    default:
      return count(entry.value);
  }
}
