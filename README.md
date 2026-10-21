# ECD Klaviyo audit v2

First draft of the v2 Klaviyo audit described in the *ECD Audit v2 Handoff* doc. It pulls a prospect's Klaviyo data, computes every number in code, ranks 4 to 6 revenue opportunities and writes three things:

| File | Who it is for | What it is |
| --- | --- | --- |
| `deck.html` | The prospect | Branded 16:9 sales deck. Open in a browser; print to PDF (landscape, no margins) for a PDF |
| `brief.md` | The Lifecycle Strategist | Opener, three findings, questions, objections, price and dated close, and a checklist of figures to verify |
| `ledger.csv` | Whoever checks the numbers | Every figure with its source endpoint, date range and notes; placeholder-based figures are marked `[VERIFY]` |

It also saves `snapshot.json`, the raw pull, so the same audit can be re-run later without calling Klaviyo.

This is a separate repo from v1 (`ecd-klaviyo-audit`), which it does not touch.

## Try it

Needs Node 20 or later.

```bash
npm install
npm run demo
```

That runs on a made-up account and writes to `out/demo-brand-co-<date>/`.

## Run it on a real account

1. Create a private API key in the prospect's Klaviyo account with read-only access to accounts, metrics, campaigns and flows.
2. Copy `.env.example` to `.env` and paste the key in.
3. Run:

```bash
npm run audit -- --brand "Brand Name"
```

The campaign and flow reports are limited by Klaviyo to 2 calls a minute, so a pull can take a few minutes if it gets rate limited; the client waits and retries.

To re-analyse a saved pull (for example after changing benchmarks):

```bash
npm run audit -- --snapshot out/brand-name-2026-10-21/snapshot.json
```

## What it checks

| Check | Data | Method |
| --- | --- | --- |
| Revenue split | Placed Order revenue by `$attributed_channel`, last 30 complete days | Same method as the `/klaviyo-audit` skill, so both tools give a prospect the same headline |
| Core flows | Flow names, status, 90-day flow message stats | Abandoned checkout, welcome, browse abandonment, post-purchase and winback, each against a benchmark share of store revenue |
| Campaign cadence | 90-day email campaign stats | Sends per week against benchmark |
| Campaign click rate | Same | Click rate against benchmark (opens are ignored because of Apple Mail Privacy Protection) |
| Deliverability | Same | Bounce, spam complaint and unsubscribe rates against limits |
| Subject lines (feature 4) | Received Email and Clicked Email by Subject, 90 days | Click rate with vs without six patterns; below 20 subject lines these are observations, not trends |

## Before using it with a prospect

The benchmarks in `src/benchmarks.ts` are **placeholder rules of thumb**, not ECD's. Replace them with v1's `_shared/benchmarks.ts` values. Until then the deck shows an on-screen banner (it does not print) and the brief lists every figure to check.

The pricing card on the next-steps slide is a placeholder for the strategist to fill.

## Layout

```
src/
  cli.ts               command line entry
  klaviyo/client.ts    auth, revision header, retries, pagination
  klaviyo/pull.ts      every API call, into an AccountSnapshot
  analysis/            pure functions: snapshot in, numbers + ledger out
  render/              deck.html, brief.md, ledger.csv
  benchmarks.ts        every threshold in one place
  demo/fixture.ts      the demo account
tests/                 vitest; no network
```

## Checks

```bash
npm run typecheck
npm test
```

GitHub Actions runs both, plus a demo audit, on every push and pull request.

## Not in this draft yet

From the handoff doc, in rough order: the learning loop (store AI draft next to the edited final), segment performance (feature 2), flow structure diagnostics (feature 6), repeat rate and CLTV (feature 5), customer cohorts with Shopify (feature 1), Google Slides export, and saving snapshots per client for re-audits (option D).
