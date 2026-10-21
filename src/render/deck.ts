import { readFileSync } from "node:fs";
import type { AuditResult } from "../analysis/index.js";
import type { FlowState } from "../analysis/flows.js";
import { benchmarks } from "../benchmarks.js";
import { money, percent } from "../format.js";
import type { Opportunity } from "../types.js";

// The client-facing deck: one HTML file, 16:9 slides, ECD brand, images
// inlined so it can be emailed or opened offline. Print to PDF from a
// browser (landscape, no margins) for a PDF version.

const asset = (name: string) => `data:image/png;base64,${readFileSync(new URL(`../../assets/${name}`, import.meta.url)).toString("base64")}`;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Escapes, then turns the one *word* in a headline into the brand's italic emphasis. */
export function headline(text: string): string {
  return escapeHtml(text).replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

const stateLabel: Record<FlowState, string> = {
  missing: "Missing",
  not_live: "Built, not live",
  underperforming: "Underperforming",
  healthy: "Healthy",
};

function slide(body: string, opts: { cls?: string; footer?: boolean; logo?: string } = {}): string {
  const footer = opts.footer === false ? "" : `<footer><img src="${opts.logo}" alt="ECD Digital Strategy"><span>Every figure is traceable in the numbers ledger.</span></footer>`;
  return `<section class="slide ${opts.cls ?? ""}">${body}${footer}</section>`;
}

function opportunitySlide(o: Opportunity, index: number, currency: string, logo: string): string {
  const value = o.monthlyValue > 0 ? `<div class="big">+${money(o.monthlyValue, currency)}<small> / month</small></div>` : `<div class="big risk">Risk to fix</div>`;
  return slide(
    `<div class="eyebrow"><span class="ecd-tag">Opportunity ${index + 1}</span>${o.impact.map((t) => `<span class="impact">${escapeHtml(t)}</span>`).join("")}</div>
     <h2>${headline(o.headline)}</h2>
     <div class="two-col">
       <div>${value}<p class="finding">${escapeHtml(o.finding)}</p>
         <ul class="evidence">${o.evidence.map((e) => `<li>${escapeHtml(e.text)}</li>`).join("")}</ul></div>
       <div class="ecd-card fix"><div class="subhead">The fix</div><p>${escapeHtml(o.fix)}</p></div>
     </div>`,
    { logo },
  );
}

export function renderDeck(result: AuditResult): string {
  const { snapshot, revenue, campaigns, flows, subjects, opportunities, totalMonthlyOpportunity } = result;
  const c = snapshot.currency;
  const logoWhite = asset("ecd-logo-primary-horizontal-white.png");
  const logo = asset("ecd-logo-primary-horizontal.png");
  const cover = asset("ecd-cover-blue.png");
  const pulled = new Date(snapshot.pulledAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const liveCore = flows.filter((f) => f.state === "healthy" || f.state === "underperforming").length;
  const hasPlaceholders = result.ledger.all().some((e) => e.verify);
  // The weakest core flow, by the revenue gap to its benchmark.
  const firstFlowFix = flows
    .filter((f) => f.state !== "healthy")
    .sort((a, b) => b.benchmarkMonthly - b.monthlyRevenue - (a.benchmarkMonthly - a.monthlyRevenue))[0]?.spec.label;

  const slides: string[] = [];

  slides.push(
    slide(
      `<img class="cover-logo" src="${logoWhite}" alt="ECD Digital Strategy">
       <div class="cover-body"><span class="ecd-tag light">Klaviyo audit</span>
       <h1>${escapeHtml(snapshot.brand)}: the email <em>opportunity</em></h1>
       <p class="cover-date">Prepared ${pulled}${snapshot.source === "demo" ? " · demo data" : ""}</p></div>`,
      { cls: "cover", footer: false },
    ),
  );

  slides.push(
    slide(
      `<div class="eyebrow"><span class="ecd-tag">At a glance</span></div>
       <h2>${money(totalMonthlyOpportunity, c)} a month is on the <em>table</em></h2>
       <div class="stats">
         <div class="ecd-card stat"><div class="subhead">Store revenue, last 30 days</div><div class="num">${money(revenue.total, c)}</div></div>
         <div class="ecd-card stat"><div class="subhead">From email and SMS</div><div class="num">${percent(revenue.ownedShare)}</div><div class="note">Healthy accounts: ${percent(revenue.targetShare, 0)}</div></div>
         <div class="ecd-card stat"><div class="subhead">Campaigns per week</div><div class="num">${campaigns.perWeek.toFixed(1)}</div><div class="note">Healthy accounts: ${benchmarks.campaignsPerWeek}</div></div>
         <div class="ecd-card stat"><div class="subhead">Core flows live</div><div class="num">${liveCore} of ${flows.length}</div></div>
       </div>`,
      { logo },
    ),
  );

  const share = (v: number) => (revenue.total > 0 ? (v / revenue.total) * 100 : 0);
  const other = revenue.owned - revenue.email - revenue.sms;
  slides.push(
    slide(
      `<div class="eyebrow"><span class="ecd-tag">Where revenue comes from</span></div>
       <h2>Email and SMS drive ${percent(revenue.ownedShare, 0)} of <em>revenue</em></h2>
       <div class="bar-wrap">
         <div class="bar">
           <span class="seg email" style="width:${share(revenue.email)}%"></span>
           <span class="seg sms" style="width:${share(revenue.sms)}%"></span>
           <span class="seg other" style="width:${share(other)}%"></span>
         </div>
         <div class="target" style="left:${revenue.targetShare * 100}%"><span>Healthy: ${percent(revenue.targetShare, 0)}</span></div>
       </div>
       <ul class="legend">
         <li><i class="email"></i>Email ${money(revenue.email, c)}</li>
         <li><i class="sms"></i>SMS ${money(revenue.sms, c)}</li>
         ${other > 0 ? `<li><i class="other"></i>Other Klaviyo channels ${money(other, c)}</li>` : ""}
         <li><i class="rest"></i>Everything else ${money(revenue.total - revenue.owned, c)}</li>
       </ul>
       <p class="caption">Placed Order revenue by attributed channel, last 30 complete days. Reaching ${percent(revenue.targetShare, 0)} would add about ${money(revenue.monthlyGap, c)} a month.</p>`,
      { logo },
    ),
  );

  slides.push(
    slide(
      `<div class="eyebrow"><span class="ecd-tag">The opportunities</span></div>
       <h2>${opportunities.length} fixes, ranked by <em>revenue</em></h2>
       <ol class="opp-list">${opportunities
         .map((o) => `<li><span class="opp-name">${headline(o.headline)}</span><span class="opp-value">${o.monthlyValue > 0 ? `+${money(o.monthlyValue, c)}/mo` : "Risk"}</span></li>`)
         .join("")}</ol>`,
      { logo },
    ),
  );

  opportunities.forEach((o, i) => slides.push(opportunitySlide(o, i, c, logo)));

  slides.push(
    slide(
      `<div class="eyebrow"><span class="ecd-tag">Flow health</span></div>
       <h2>How the core flows <em>stack up</em></h2>
       <table class="grid"><thead><tr><th>Flow</th><th>Status</th><th>Revenue / month</th><th>Benchmark / month</th></tr></thead><tbody>
       ${flows
         .map(
           (f) => `<tr><td>${escapeHtml(f.spec.label)}${f.flow ? `<div class="sub">${escapeHtml(f.flow.name)}</div>` : ""}</td>
           <td><span class="state ${f.state}">${stateLabel[f.state]}</span></td>
           <td>${money(f.monthlyRevenue, c)}</td><td>${money(f.benchmarkMonthly, c)}</td></tr>`,
         )
         .join("")}
       </tbody></table>`,
      { logo },
    ),
  );

  const patternRows = subjects.patterns.slice(0, 5);
  slides.push(
    slide(
      `<div class="eyebrow"><span class="ecd-tag">Subject lines</span></div>
       <h2>What earns the <em>click</em></h2>
       ${
         patternRows.length === 0
           ? `<p class="finding">Not enough subject lines with ${benchmarks.minSubjectRecipients}+ recipients to compare yet.</p>`
           : `<table class="grid"><thead><tr><th>Subject line pattern</th><th>Click rate with</th><th>Click rate without</th><th>Difference</th></tr></thead><tbody>
       ${patternRows
         .map(
           (p) =>
             `<tr><td>${escapeHtml(p.label)}<div class="sub">${p.withCount} vs ${p.withoutCount} subject lines</div></td><td>${percent(p.withClickRate, 2)}</td><td>${percent(p.withoutClickRate, 2)}</td><td class="${p.lift >= 0 ? "up" : "down"}">${p.lift >= 0 ? "+" : ""}${percent(p.lift, 0)}</td></tr>`,
         )
         .join("")}</tbody></table>`
       }
       <p class="caption">${subjects.subjectCount} subject lines over 90 days, judged on click rate (opens are inflated by Apple Mail Privacy Protection).${subjects.mode === "observations" ? " Fewer than 20 subject lines, so read these as observations, not trends." : ""}</p>`,
      { logo },
    ),
  );

  slides.push(
    slide(
      `<div class="eyebrow"><span class="ecd-tag">Next steps</span></div>
       <h2>How we would <em>start</em></h2>
       <div class="stats three">
         <div class="ecd-card stat"><div class="subhead">Weeks 1–2</div><p>${firstFlowFix ? `Switch on and repair the core flows, starting with ${escapeHtml(firstFlowFix.toLowerCase())}.` : "Tune the core flows that are already live and earning."}</p></div>
         <div class="ecd-card stat"><div class="subhead">Weeks 3–6</div><p>Move to a ${benchmarks.campaignsPerWeek}-a-week campaign calendar with engagement-based segments.</p></div>
         <div class="ecd-card stat"><div class="subhead">Ongoing</div><p>Monthly reporting against the numbers in this audit, so progress is measured, not promised.</p></div>
       </div>
       <div class="pricing ecd-card"><div class="subhead">Investment</div><p>[Pricing set by the strategist before the call]</p></div>
       <a class="ecd-cta" href="#">Book the strategy session</a>`,
      { logo },
    ),
  );

  slides.push(
    slide(
      `<img class="cover-logo" src="${logoWhite}" alt="ECD Digital Strategy">
       <div class="cover-body"><h1>Thank <em>you</em></h1><p class="cover-date">ECD Digital Strategy</p></div>`,
      { cls: "cover", footer: false },
    ),
  );

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(snapshot.brand)} Klaviyo audit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--blue:#4B3AFF;--gray:#606060;--fuchsia:#EF2B93;--indigo:#0F0FA3;--green:#00C46A;--lavender:#ECECFF;--ink:#1a1a2e;
--display:'Playfair Display',Georgia,serif;--sub:'Jost','Century Gothic',sans-serif;--body:Arial,Helvetica,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:#d9d9e6;font-family:var(--body);color:var(--ink)}
.slide{position:relative;width:1280px;height:720px;margin:24px auto;padding:56px 72px 80px;background:#fff;overflow:hidden;box-shadow:0 10px 30px rgba(75,58,255,.12)}
h1,h2{font-family:var(--display);font-weight:600;color:var(--blue);line-height:1.12;margin:0 0 28px}
h1{font-size:64px}h2{font-size:44px}
em{font-style:italic}
.subhead{font-family:var(--sub);text-transform:uppercase;letter-spacing:.14em;color:var(--blue);font-weight:600;font-size:13px;margin-bottom:10px}
.eyebrow{display:flex;gap:10px;align-items:center;margin-bottom:22px}
.ecd-tag{font-family:var(--sub);text-transform:uppercase;letter-spacing:.1em;font-size:12px;color:var(--blue);border:1.5px solid var(--blue);border-radius:999px;padding:6px 16px}
.ecd-tag.light{color:#fff;border-color:#fff}
.impact{font-family:var(--sub);text-transform:uppercase;letter-spacing:.08em;font-size:11px;background:var(--lavender);color:var(--indigo);border-radius:999px;padding:6px 12px}
.ecd-card{background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(75,58,255,.10),0 2px 8px rgba(0,0,0,.05);padding:24px}
.ecd-cta{display:inline-block;margin-top:24px;font-family:var(--sub);font-weight:600;text-transform:uppercase;letter-spacing:.08em;font-size:14px;color:#fff;background:var(--fuchsia);padding:14px 30px;border-radius:999px;text-decoration:none;box-shadow:0 12px 26px -6px rgba(239,43,147,.55)}
footer{position:absolute;left:72px;right:72px;bottom:24px;display:flex;justify-content:space-between;align-items:center;color:var(--gray);font-size:12px}
footer img{height:26px}
.cover{background:var(--blue) url(${cover}) center/cover;color:#fff;display:flex;flex-direction:column;justify-content:space-between}
.cover h1{color:#fff;max-width:900px;margin-top:20px}
.cover-logo{height:44px;align-self:flex-start}
.cover-date{font-family:var(--sub);letter-spacing:.1em;text-transform:uppercase;font-size:15px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:12px}
.stats.three{grid-template-columns:repeat(3,1fr)}
.stat .num{font-family:var(--display);font-size:40px;color:var(--ink)}
.stat .note{color:var(--gray);font-size:14px;margin-top:6px}
.stat p{margin:0;font-size:16px;line-height:1.45}
.bar-wrap{position:relative;margin:56px 0 24px}
.bar{display:flex;height:56px;border-radius:10px;overflow:hidden;background:var(--lavender)}
.seg.email{background:var(--blue)}.seg.sms{background:var(--indigo)}.seg.other{background:#8f86ff}
.target{position:absolute;top:-30px;bottom:-8px;border-left:2px dashed var(--fuchsia)}
.target span{position:absolute;top:-6px;left:8px;white-space:nowrap;color:var(--fuchsia);font-family:var(--sub);font-size:13px;text-transform:uppercase;letter-spacing:.08em}
.legend{list-style:none;padding:0;display:flex;gap:28px;font-size:16px}
.legend i{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:8px;vertical-align:-2px}
.legend .email{background:var(--blue)}.legend .sms{background:var(--indigo)}.legend .other{background:#8f86ff}.legend .rest{background:var(--lavender)}
.caption{color:var(--gray);font-size:14px;margin-top:20px;max-width:960px}
.opp-list{padding:0;margin:0;list-style:none;counter-reset:o}
.opp-list li{counter-increment:o;display:flex;justify-content:space-between;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--lavender);font-size:22px}
.opp-list li::before{content:counter(o);font-family:var(--display);color:var(--blue);font-size:26px;width:44px}
.opp-name{flex:1;font-family:var(--display)}
.opp-value{font-family:var(--sub);font-weight:600;color:var(--blue)}
.two-col{display:grid;grid-template-columns:1.4fr 1fr;gap:40px}
.big{font-family:var(--display);font-size:56px;color:var(--blue)}.big small{font-size:22px;color:var(--gray)}
.big.risk{color:var(--fuchsia);font-size:40px}
.finding{font-size:19px;line-height:1.5}
.evidence{color:var(--gray);font-size:16px;line-height:1.7;padding-left:20px}
.fix{background:var(--lavender);box-shadow:none;align-self:start}.fix p{font-size:18px;line-height:1.5;margin:0}
.grid{width:100%;border-collapse:collapse;font-size:17px}
.grid th{text-align:left;font-family:var(--sub);text-transform:uppercase;letter-spacing:.08em;font-size:12px;color:#fff;background:var(--blue);padding:12px 14px}
.grid td{padding:12px 14px;border-bottom:1px solid var(--lavender)}
.grid tr:nth-child(even) td{background:#f7f7ff}
.grid .sub{color:var(--gray);font-size:13px;margin-top:3px}
.state{font-family:var(--sub);font-size:12px;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:999px}
.state.healthy{background:#e3fbef;color:#00794a}.state.underperforming{background:#fff2d6;color:#8a5a00}.state.not_live,.state.missing{background:#fde3f0;color:#b0105e}
.up{color:#00794a;font-weight:bold}.down{color:#b0105e;font-weight:bold}
.pricing{margin-top:20px}.pricing p{margin:0;color:var(--gray)}
.draft-banner{max-width:1280px;margin:24px auto 0;padding:12px 18px;background:#fff2d6;color:#8a5a00;font-size:14px;border-radius:8px}
@page{size:1280px 720px;margin:0}
@media print{body{background:#fff}.slide{margin:0;box-shadow:none;page-break-after:always}.draft-banner{display:none}}
</style></head>
<body>
${hasPlaceholders ? `<div class="draft-banner">Internal check: some figures rest on placeholder benchmarks. Confirm every [VERIFY] line in ledger.csv before presenting. This banner does not print.</div>` : ""}
${slides.join("\n")}
</body></html>`;
}
