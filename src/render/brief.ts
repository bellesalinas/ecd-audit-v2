import type { AuditResult } from "../analysis/index.js";
import { formatEntry, money, percent } from "../format.js";

// The internal strategist brief: what to say on the sales call, built from
// the same numbers as the deck. Never sent to the prospect.

/** Adds business days (Mon to Fri) to a date. */
export function addBusinessDays(from: Date, days: number): Date {
  const date = new Date(from);
  let added = 0;
  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return date;
}

const plain = (text: string) => text.replace(/\*/g, "");

export function renderBrief(result: AuditResult): string {
  const { snapshot, revenue, campaigns, flows, subjects, opportunities, totalMonthlyOpportunity, ledger } = result;
  const c = snapshot.currency;
  const top = opportunities[0];
  const closeDate = addBusinessDays(new Date(snapshot.pulledAt), 2).toISOString().slice(0, 10);
  const missing = flows.filter((f) => f.state === "missing" || f.state === "not_live");
  const verify = ledger.all().filter((e) => e.verify);

  const lines: string[] = [];
  lines.push(`# Strategist brief: ${snapshot.brand}`);
  lines.push("");
  lines.push(`Internal only. Data pulled ${snapshot.pulledAt.slice(0, 10)} from ${snapshot.source === "demo" ? "the demo account" : "Klaviyo"}. Every number below is in ledger.csv.`);
  lines.push("");

  lines.push("## Opener");
  lines.push("");
  lines.push(
    top
      ? `"Email and SMS drive ${percent(revenue.ownedShare, 0)} of your revenue today. The biggest single gap we found is that ${plain(top.headline).toLowerCase()}, and fixing it is worth about ${money(top.monthlyValue, c)} a month."`
      : `"Email and SMS drive ${percent(revenue.ownedShare, 0)} of your revenue today."`,
  );
  lines.push("");

  lines.push("## The three findings to land");
  lines.push("");
  opportunities.slice(0, 3).forEach((o, i) => {
    lines.push(`${i + 1}. **${plain(o.headline)}**${o.monthlyValue > 0 ? ` (${money(o.monthlyValue, c)}/month)` : ""}. ${o.finding}`);
    for (const e of o.evidence) lines.push(`    - ${e.text} \`${e.ledgerId}\``);
    lines.push(`    - How the estimate was made: ${o.method}`);
  });
  lines.push("");

  lines.push("## Questions to ask");
  lines.push("");
  lines.push("1. Who owns email and SMS today, and how many hours a week go into it?");
  lines.push("2. What does a customer's second order usually look like, and how long after the first?");
  if (missing.length > 0) lines.push(`3. ${missing.map((f) => f.spec.label).join(", ")}: was that a decision, or did it never get built?`);
  else lines.push("3. Which flow do you trust least right now?");
  lines.push(`4. You send ${campaigns.perWeek.toFixed(1)} campaigns a week. What stops you sending more?`);
  lines.push("5. What would make the next 90 days a success for you?");
  lines.push("");

  lines.push("## Likely objections");
  lines.push("");
  lines.push(`- **"We tried more emails and people unsubscribed."** Unsubscribe rate is ${percent(campaigns.unsubscribeRate, 2)} today. Extra sends go to engaged segments first, so the list most likely to leave hears from us less.`);
  lines.push(`- **"These numbers look optimistic."** Each estimate is in the ledger with its method. The deck total is ${money(totalMonthlyOpportunity, c)} a month; the overall gap to a healthy email and SMS share is ${money(revenue.monthlyGap, c)}. Quote the lower of the two if pushed.`);
  lines.push(`- **"We can do this in house."** Agree on what they can, then point to the build effort in finding 1.`);
  lines.push("");

  lines.push("## Price and close");
  lines.push("");
  lines.push("- Spoken price: **[set before the call]**");
  lines.push(`- Dated close: "I'll send the proposal by ${closeDate}. Can we hold 20 minutes that day to walk through it?"`);
  lines.push("");

  lines.push("## Subject line notes");
  lines.push("");
  if (subjects.patterns.length === 0) {
    lines.push("Not enough subject lines to compare.");
  } else {
    if (subjects.mode === "observations") lines.push("Fewer than 20 subject lines: treat these as observations, not trends.");
    for (const p of subjects.patterns.slice(0, 3)) {
      lines.push(`- ${p.label}: ${percent(p.withClickRate, 2)} click rate vs ${percent(p.withoutClickRate, 2)} without (${p.lift >= 0 ? "+" : ""}${percent(p.lift, 0)}).`);
    }
  }
  lines.push("");

  lines.push("## Check before presenting");
  lines.push("");
  if (verify.length === 0) {
    lines.push("Nothing flagged.");
  } else {
    lines.push("These figures rest on placeholder benchmarks. Confirm or replace each one:");
    lines.push("");
    for (const e of verify) lines.push(`- [ ] ${e.label}: ${formatEntry(e, c)} \`${e.id}\``);
  }
  lines.push("");
  return lines.join("\n");
}
