import { formatEntry } from "../format.js";
import type { Ledger } from "../ledger.js";

const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function renderLedgerCsv(ledger: Ledger, currency: string): string {
  const header = ["id", "label", "value", "display", "unit", "source", "date_range", "notes", "verify"];
  const rows = ledger
    .all()
    .map((e) => [e.id, e.label, String(e.value), formatEntry(e, currency), e.unit, e.source, e.dateRange, e.notes, e.verify ? "[VERIFY]" : ""]);
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
