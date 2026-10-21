import { describe, expect, it } from "vitest";
import { analyse } from "../src/analysis/index.js";
import { demoSnapshot } from "../src/demo/fixture.js";
import { addBusinessDays, renderBrief } from "../src/render/brief.js";
import { escapeHtml, headline, renderDeck } from "../src/render/deck.js";
import { renderLedgerCsv } from "../src/render/ledger-csv.js";

describe("deck", () => {
  const html = renderDeck(analyse(demoSnapshot()));

  it("has a cover, an at-a-glance slide, one slide per opportunity and the closing slides", () => {
    const slides = html.match(/<section class="slide/g) ?? [];
    const opportunities = analyse(demoSnapshot()).opportunities.length;
    expect(slides.length).toBe(4 + opportunities + 4);
  });

  it("inlines the brand images so the file works offline", () => {
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toMatch(/src="(\.\.\/)?assets\//);
  });

  it("escapes brand names", () => {
    const snap = demoSnapshot();
    snap.brand = `<script>alert("x")</script> & Co`;
    const out = renderDeck(analyse(snap));
    expect(out).not.toContain("<script>alert");
    expect(out).toContain("&lt;script&gt;");
  });

  it("names the weakest flow in next steps, not a campaign finding", () => {
    expect(html).toContain("starting with abandoned checkout");
  });
});

describe("headline", () => {
  it("italicises the starred word and escapes the rest", () => {
    expect(headline("Flows & *more*")).toBe("Flows &amp; <em>more</em>");
    expect(escapeHtml('"a"')).toBe("&quot;a&quot;");
  });
});

describe("brief", () => {
  const brief = renderBrief(analyse(demoSnapshot()));

  it("has every section the strategist needs", () => {
    for (const heading of ["## Opener", "## The three findings to land", "## Questions to ask", "## Likely objections", "## Price and close", "## Check before presenting"]) {
      expect(brief).toContain(heading);
    }
  });

  it("dates the close two business days after the pull", () => {
    // Pulled Wednesday 2026-10-21, so the close is Friday 2026-10-23.
    expect(brief).toContain("by 2026-10-23");
    expect(addBusinessDays(new Date("2026-10-23T09:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2026-10-27");
  });

  it("lists placeholder benchmarks to verify", () => {
    expect(brief).toMatch(/- \[ \] .*`rev\.target_share`/);
  });
});

describe("ledger csv", () => {
  it("quotes cells with commas and flags placeholders", () => {
    const result = analyse(demoSnapshot());
    const csv = renderLedgerCsv(result.ledger, "USD");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,label,value,display,unit,source,date_range,notes,verify");
    expect(lines).toHaveLength(result.ledger.all().length + 1);
    expect(csv).toContain('"$412,000"');
    expect(csv).toContain("[VERIFY]");
  });
});
