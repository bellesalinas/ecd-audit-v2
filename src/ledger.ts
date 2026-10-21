// The numbers ledger: every figure that reaches the deck or the brief is
// recorded here with where it came from, so a strategist can check it
// before presenting. Figures that rest on a placeholder benchmark carry
// verify: true and print as [VERIFY].

export type LedgerUnit = "currency" | "percent" | "count" | "ratio" | "per_week";

export interface LedgerEntry {
  id: string;
  label: string;
  value: number;
  unit: LedgerUnit;
  /** Klaviyo endpoint or calculation the number came from. */
  source: string;
  dateRange: string;
  notes: string;
  verify: boolean;
}

export class Ledger {
  private entries = new Map<string, LedgerEntry>();

  add(entry: Omit<LedgerEntry, "notes" | "verify"> & Partial<Pick<LedgerEntry, "notes" | "verify">>): string {
    if (this.entries.has(entry.id)) {
      throw new Error(`Ledger id "${entry.id}" recorded twice`);
    }
    this.entries.set(entry.id, { notes: "", verify: false, ...entry });
    return entry.id;
  }

  get(id: string): LedgerEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Ledger id "${id}" not found`);
    return entry;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  all(): LedgerEntry[] {
    return [...this.entries.values()];
  }
}
