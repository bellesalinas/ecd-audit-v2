import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { analyse } from "./analysis/index.js";
import { demoSnapshot } from "./demo/fixture.js";
import { money } from "./format.js";
import { KlaviyoClient } from "./klaviyo/client.js";
import { pullSnapshot } from "./klaviyo/pull.js";
import { renderBrief } from "./render/brief.js";
import { loadDeckAssets } from "./render/assets-node.js";
import { renderDeck } from "./render/deck.js";
import { renderLedgerCsv } from "./render/ledger-csv.js";
import type { AccountSnapshot } from "./types.js";

const HELP = `ECD Klaviyo audit v2

Usage:
  npm run demo                              Run on the built-in demo account
  npm run audit -- --brand "Simple & Dainty" Pull live data (needs KLAVIYO_API_KEY)
  npm run audit -- --snapshot out/x/snapshot.json   Re-analyse a saved pull

Options:
  --demo             Use the demo account instead of Klaviyo
  --brand <name>     Brand name for the deck (default: Klaviyo account name)
  --snapshot <file>  Analyse a snapshot.json from an earlier run, no API calls
  --out <dir>        Output folder (default: out/<brand>-<date>)
  -h, --help         Show this help

Writes: deck.html, brief.md, ledger.csv, snapshot.json`;

/** Reads KEY=value lines from .env without overriding the real environment. */
function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]!] === undefined) process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "audit";
}

async function main() {
  const { values } = parseArgs({
    options: {
      demo: { type: "boolean", default: false },
      brand: { type: "string" },
      snapshot: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  loadDotEnv();
  const log = (line: string) => console.log(`  ${line}`);

  let snapshot: AccountSnapshot;
  if (values.demo) {
    snapshot = demoSnapshot();
  } else if (values.snapshot) {
    snapshot = JSON.parse(readFileSync(values.snapshot, "utf8")) as AccountSnapshot;
  } else {
    const key = process.env.KLAVIYO_API_KEY;
    if (!key) {
      console.error("KLAVIYO_API_KEY is not set. Add it to .env (see .env.example), or run `npm run demo`.");
      process.exitCode = 1;
      return;
    }
    if (key.includes("your_key_here")) {
      console.error("KLAVIYO_API_KEY in .env is still the example placeholder. Replace pk_your_key_here with the real private key and save the file.");
      process.exitCode = 1;
      return;
    }
    console.log("Pulling from Klaviyo. The two report calls are rate limited, so this can take a few minutes.");
    snapshot = await pullSnapshot(new KlaviyoClient(key, fetch, log), { brand: values.brand, log });
  }
  if (values.brand) snapshot.brand = values.brand;

  const result = analyse(snapshot);
  const outDir = resolve(values.out ?? join("out", `${slug(snapshot.brand)}-${snapshot.pulledAt.slice(0, 10)}`));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "snapshot.json"), JSON.stringify(snapshot, null, 2));
  writeFileSync(join(outDir, "deck.html"), renderDeck(result, loadDeckAssets()));
  writeFileSync(join(outDir, "brief.md"), renderBrief(result));
  writeFileSync(join(outDir, "ledger.csv"), renderLedgerCsv(result.ledger, snapshot.currency));

  const verify = result.ledger.all().filter((e) => e.verify).length;
  console.log(`\n${snapshot.brand}: ${result.opportunities.length} opportunities, ${money(result.totalMonthlyOpportunity, snapshot.currency)} a month`);
  for (const o of result.opportunities) {
    console.log(`  ${o.monthlyValue > 0 ? money(o.monthlyValue, snapshot.currency).padStart(10) : "risk".padStart(10)}  ${o.headline.replace(/\*/g, "")}`);
  }
  console.log(`\nWrote ${outDir}/{deck.html, brief.md, ledger.csv, snapshot.json}`);
  if (verify > 0) console.log(`${verify} ledger figures are marked [VERIFY] (placeholder benchmarks).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
