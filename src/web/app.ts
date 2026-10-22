// Browser prototype of the audit. Runs the same analysis and renderers as the
// CLI on sample accounts or an uploaded snapshot.json. It never calls Klaviyo:
// the real tool does that from a strategist's machine with a read-only key.

import logo from "../../assets/ecd-logo-primary-horizontal.png";
import logoWhite from "../../assets/ecd-logo-primary-horizontal-white.png";
import cover from "../../assets/ecd-cover-blue.png";
import { analyse, type AuditResult } from "../analysis/index.js";
import { benchmarks, coreFlows } from "../benchmarks.js";
import { scenarios } from "../demo/scenarios.js";
import { formatEntry, money, percent } from "../format.js";
import { renderBrief } from "../render/brief.js";
import { escapeHtml, headline, renderDeck } from "../render/deck.js";
import { renderLedgerCsv } from "../render/ledger-csv.js";
import type { AccountSnapshot } from "../types.js";
import { markdownToHtml } from "./markdown.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const assets = { logo, logoWhite, cover };
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Benchmarks editor ------------------------------------------------------

interface BenchField {
  id: string;
  label: string;
  unit: "%" | "per week" | "x";
  get: () => number;
  set: (v: number) => void;
  /** Displayed value = stored value * scale. */
  scale: number;
  step: number;
}

const benchFields: BenchField[] = [
  { id: "b-share", label: "Healthy share of revenue from email and SMS", unit: "%", scale: 100, step: 1, get: () => benchmarks.ownedChannelShare, set: (v) => (benchmarks.ownedChannelShare = v) },
  { id: "b-cadence", label: "Healthy campaigns per week", unit: "per week", scale: 1, step: 0.5, get: () => benchmarks.campaignsPerWeek, set: (v) => (benchmarks.campaignsPerWeek = v) },
  { id: "b-click", label: "Healthy campaign click rate", unit: "%", scale: 100, step: 0.1, get: () => benchmarks.campaignClickRate, set: (v) => (benchmarks.campaignClickRate = v) },
  { id: "b-yield", label: "Each extra campaign earns this share of an average one", unit: "x", scale: 1, step: 0.05, get: () => benchmarks.extraCampaignYield, set: (v) => (benchmarks.extraCampaignYield = v) },
  { id: "b-under", label: "A live flow is underperforming below this share of its benchmark", unit: "%", scale: 100, step: 5, get: () => benchmarks.underperformingFlowRatio, set: (v) => (benchmarks.underperformingFlowRatio = v) },
  ...coreFlows.map(
    (f): BenchField => ({
      id: `b-flow-${f.key}`,
      label: `${f.label}: monthly revenue as a share of store revenue`,
      unit: "%",
      scale: 100,
      step: 0.25,
      get: () => f.shareOfStoreRevenue,
      set: (v) => (f.shareOfStoreRevenue = v),
    }),
  ),
  { id: "b-unsub", label: "Unsubscribe rate limit", unit: "%", scale: 100, step: 0.05, get: () => benchmarks.deliverability.unsubscribeRate, set: (v) => (benchmarks.deliverability.unsubscribeRate = v) },
  { id: "b-bounce", label: "Bounce rate limit", unit: "%", scale: 100, step: 0.1, get: () => benchmarks.deliverability.bounceRate, set: (v) => (benchmarks.deliverability.bounceRate = v) },
  { id: "b-spam", label: "Spam complaint rate limit", unit: "%", scale: 100, step: 0.01, get: () => benchmarks.deliverability.spamComplaintRate, set: (v) => (benchmarks.deliverability.spamComplaintRate = v) },
];
const benchDefaults = new Map(benchFields.map((f) => [f.id, f.get()]));

const round = (v: number) => Math.round(v * 10_000) / 10_000;

function renderBenchmarks() {
  $("bench-fields").innerHTML = benchFields
    .map(
      (f) => `<label class="bench-row" for="${f.id}"><span>${escapeHtml(f.label)}</span>
        <span class="bench-input"><input id="${f.id}" type="number" inputmode="decimal" step="${f.step}" min="0" value="${round(f.get() * f.scale)}"><span class="unit">${f.unit === "x" ? "×" : f.unit}</span></span></label>`,
    )
    .join("");
  for (const f of benchFields) {
    const input = $<HTMLInputElement>(f.id);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) return;
      f.set(value / f.scale);
      input.closest(".bench-row")!.classList.toggle("changed", round(f.get()) !== round(benchDefaults.get(f.id)!));
      updateBenchCount();
      if (current) show(analyse(current), { quiet: true });
    });
  }
  updateBenchCount();
}

function updateBenchCount() {
  const changed = benchFields.filter((f) => round(f.get()) !== round(benchDefaults.get(f.id)!)).length;
  $("bench-count").textContent = changed === 0 ? "Placeholder values" : `${changed} changed`;
  $<HTMLButtonElement>("bench-reset").disabled = changed === 0;
}

$("bench-reset").addEventListener("click", () => {
  for (const f of benchFields) f.set(benchDefaults.get(f.id)!);
  renderBenchmarks();
  if (current) show(analyse(current), { quiet: true });
});

// ---- Account choice ------------------------------------------------------------

let uploaded: AccountSnapshot | null = null;
let current: AccountSnapshot | null = null;

function renderAccounts() {
  $("accounts").innerHTML =
    scenarios
      .map(
        (s, i) => `<label class="account" for="acc-${s.id}">
        <input type="radio" name="account" id="acc-${s.id}" value="${s.id}"${i === 0 ? " checked" : ""}>
        <span class="account-body"><span class="account-name">${escapeHtml(s.label)}</span><span class="account-desc">${escapeHtml(s.description)}</span></span></label>`,
      )
      .join("") +
    `<label class="account" for="acc-upload">
      <input type="radio" name="account" id="acc-upload" value="upload">
      <span class="account-body"><span class="account-name">Upload a snapshot</span>
      <span class="account-desc" id="upload-desc">A <code>snapshot.json</code> from a real run of the tool. It stays in your browser.</span></span></label>`;
  document.querySelectorAll<HTMLInputElement>('input[name="account"]').forEach((r) =>
    r.addEventListener("change", () => {
      if (r.value === "upload" && !uploaded) $<HTMLInputElement>("snapshot-file").click();
      syncBrandPlaceholder();
    }),
  );
}

function selectedAccount(): string {
  return document.querySelector<HTMLInputElement>('input[name="account"]:checked')?.value ?? "demo";
}

function syncBrandPlaceholder() {
  const id = selectedAccount();
  const name = id === "upload" ? uploaded?.brand ?? "Brand name" : scenarios.find((s) => s.id === id)?.label ?? "";
  $<HTMLInputElement>("brand").placeholder = name;
}

function isSnapshot(value: unknown): value is AccountSnapshot {
  const v = value as Partial<AccountSnapshot> | null;
  return !!v && typeof v === "object" && Array.isArray(v.revenueByChannel) && Array.isArray(v.campaigns) && Array.isArray(v.flows) && Array.isArray(v.subjects) && !!v.revenueWindow && !!v.messageWindow;
}

$<HTMLInputElement>("snapshot-file").addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const error = $("upload-error");
  error.hidden = true;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!isSnapshot(parsed)) throw new Error("not a snapshot");
    uploaded = parsed;
    $("upload-desc").innerHTML = `<strong>${escapeHtml(file.name)}</strong> · ${escapeHtml(parsed.brand)}, pulled ${escapeHtml(parsed.pulledAt.slice(0, 10))}`;
    $<HTMLInputElement>("acc-upload").checked = true;
    syncBrandPlaceholder();
  } catch {
    error.textContent = `${file.name} isn't a snapshot from the audit tool. Use the snapshot.json written next to deck.html.`;
    error.hidden = false;
    if (!uploaded) $<HTMLInputElement>("acc-demo").checked = true;
  }
});

// ---- Running ------------------------------------------------------------------

const steps = [
  "Reading account details",
  "Finding metrics",
  "Pulling store revenue by channel (last 30 days)",
  "Pulling campaign performance (90 days)",
  "Reading flows and flow performance (90 days)",
  "Pulling subject lines (90 days)",
  "Running the five checks and ranking",
  "Writing deck, brief and ledger",
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));

async function run() {
  const id = selectedAccount();
  if (id === "upload" && !uploaded) {
    $<HTMLInputElement>("snapshot-file").click();
    return;
  }
  const snapshot = structuredClone(id === "upload" ? uploaded! : scenarios.find((s) => s.id === id)!.snapshot());
  const brand = $<HTMLInputElement>("brand").value.trim();
  if (brand) snapshot.brand = brand;

  const button = $<HTMLButtonElement>("run");
  button.disabled = true;
  button.textContent = "Running…";
  const log = $("run-log");
  log.hidden = false;
  log.innerHTML = steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const items = [...log.querySelectorAll("li")];
  for (const li of items) {
    li.classList.add("active");
    await wait(snapshot.source === "demo" ? 220 : 120);
    li.classList.replace("active", "done");
  }
  current = snapshot;
  show(analyse(snapshot));
  button.disabled = false;
  button.textContent = "Run audit";
  await wait(900);
  log.hidden = true;
}

$("run").addEventListener("click", () => void run());

// ---- Results ------------------------------------------------------------------

let lastCsv = "";
let lastBrief = "";

function show(result: AuditResult, opts: { quiet?: boolean } = {}) {
  const { snapshot, revenue, campaigns, flows, opportunities, totalMonthlyOpportunity } = result;
  const c = snapshot.currency;
  const liveCore = flows.filter((f) => f.state === "healthy" || f.state === "underperforming").length;

  $("result-brand").textContent = snapshot.brand;
  $("result-meta").textContent =
    snapshot.source === "demo"
      ? "Sample account · made-up data"
      : `Snapshot pulled ${snapshot.pulledAt.slice(0, 10)} · real account data, shown only in your browser`;

  $("stats").innerHTML = [
    ["Store revenue, last 30 days", money(revenue.total, c), ""],
    ["From email and SMS", percent(revenue.ownedShare), `Benchmark ${percent(revenue.targetShare, 0)}`],
    ["Campaigns per week", campaigns.perWeek.toFixed(1), `Benchmark ${benchmarks.campaignsPerWeek}`],
    ["Core flows live", `${liveCore} of ${flows.length}`, ""],
    ["Opportunity in the deck", totalMonthlyOpportunity > 0 ? `${money(totalMonthlyOpportunity, c)}/mo` : "None priced", revenue.monthlyGap > 0 ? `Share gap ${money(revenue.monthlyGap, c)}/mo` : ""],
  ]
    .map(([label, value, note]) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${note ? `<span class="stat-note">${note}</span>` : ""}</div>`)
    .join("");

  $("opps").innerHTML =
    opportunities.length === 0
      ? `<p class="empty">No opportunities found against the current benchmarks.</p>`
      : opportunities
          .map(
            (o, i) => `<article class="opp">
      <div class="opp-head"><span class="opp-rank">${i + 1}</span><h3>${headline(o.headline)}</h3>
        <span class="opp-value${o.monthlyValue > 0 ? "" : " risk"}">${o.monthlyValue > 0 ? `+${money(o.monthlyValue, c)}<small>/mo</small>` : "Risk"}</span></div>
      <div class="opp-tags">${o.impact.map((t) => `<span class="impact">${escapeHtml(t)}</span>`).join("")}</div>
      <p>${escapeHtml(o.finding)}</p>
      <ul class="evidence">${o.evidence.map((e) => `<li>${escapeHtml(e.text)} <code>${escapeHtml(e.ledgerId)}</code></li>`).join("")}</ul>
      <p class="fix"><span>The fix</span>${escapeHtml(o.fix)}</p>
      <details><summary>How the estimate is made</summary><p>${escapeHtml(o.method)}</p></details>
    </article>`,
          )
          .join("");

  const html = renderDeck(result, assets);
  const deck = $<HTMLIFrameElement>("deck");
  deck.srcdoc = html;
  $("deck-count").textContent = `${(html.match(/<section class="slide/g) ?? []).length} slides`;

  lastBrief = renderBrief(result);
  $("brief").innerHTML = markdownToHtml(lastBrief);

  lastCsv = renderLedgerCsv(result.ledger, c);
  renderLedger(result);

  $("results").hidden = false;
  if (!opts.quiet) $("results").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}

let lastResult: AuditResult | null = null;
function renderLedger(result: AuditResult) {
  lastResult = result;
  const onlyVerify = $<HTMLInputElement>("verify-only").checked;
  const rows = result.ledger.all().filter((e) => !onlyVerify || e.verify);
  $("ledger-count").textContent = `${result.ledger.all().length} figures · ${result.ledger.all().filter((e) => e.verify).length} to verify`;
  $("ledger-body").innerHTML = rows
    .map(
      (e) => `<tr><td><code>${escapeHtml(e.id)}</code></td><td>${escapeHtml(e.label)}${e.notes ? `<div class="note">${escapeHtml(e.notes)}</div>` : ""}</td>
      <td class="num">${escapeHtml(formatEntry(e, result.snapshot.currency))}</td><td class="src">${escapeHtml(e.source)}<div class="note">${escapeHtml(e.dateRange)}</div></td>
      <td>${e.verify ? '<span class="verify">Verify</span>' : ""}</td></tr>`,
    )
    .join("");
}
$("verify-only").addEventListener("change", () => lastResult && renderLedger(lastResult));

async function copy(text: string, button: HTMLButtonElement) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy blocked: select the text instead";
  }
  setTimeout(() => (button.textContent = label), 1800);
}
$("copy-brief").addEventListener("click", (e) => void copy(lastBrief, e.currentTarget as HTMLButtonElement));
$("copy-csv").addEventListener("click", (e) => void copy(lastCsv, e.currentTarget as HTMLButtonElement));

// ---- Tabs and deck scaling ----------------------------------------------------

const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
function selectTab(tab: HTMLButtonElement) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute("aria-selected", String(selected));
    t.tabIndex = selected ? 0 : -1;
    $(t.getAttribute("aria-controls")!).hidden = !selected;
  }
  fitDeck();
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (e) => {
    const next = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!next) return;
    const target = tabs[(i + next + tabs.length) % tabs.length]!;
    target.focus();
    selectTab(target);
  });
});

const DECK_W = 1328;
const DECK_H = 790;
function fitDeck() {
  const wrap = $("deck-wrap");
  if (!wrap.clientWidth) return;
  const scale = Math.min(1, wrap.clientWidth / DECK_W);
  $("deck").style.transform = `scale(${scale})`;
  wrap.style.height = `${Math.round(DECK_H * scale)}px`;
}
new ResizeObserver(fitDeck).observe($("deck-wrap"));

// ---- Start --------------------------------------------------------------------

document.querySelectorAll<HTMLImageElement>("img[data-logo]").forEach((img) => (img.src = logo));
renderAccounts();
renderBenchmarks();
syncBrandPlaceholder();
// Open in a working state: the demo account, already run.
current = scenarios[0]!.snapshot();
show(analyse(current), { quiet: true });
selectTab(tabs[0]!);
