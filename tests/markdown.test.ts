import { describe, expect, it } from "vitest";
import { analyse } from "../src/analysis/index.js";
import { demoSnapshot } from "../src/demo/fixture.js";
import { renderBrief } from "../src/render/brief.js";
import { markdownToHtml } from "../src/web/markdown.js";

describe("markdownToHtml", () => {
  it("renders headings, paragraphs, bold and code", () => {
    expect(markdownToHtml("## Opener\n\nSay **this** `now`")).toBe("<h3>Opener</h3>\n<p>Say <strong>this</strong> <code>now</code></p>");
  });

  it("nests sub-bullets under numbered items", () => {
    const html = markdownToHtml("1. First\n    - a\n    - b\n2. Second");
    expect(html).toBe("<ol>\n<li>First\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n</li>\n<li>Second\n</li>\n</ol>");
  });

  it("turns task items into checkboxes", () => {
    expect(markdownToHtml("- [ ] Check it")).toContain('<input type="checkbox">');
  });

  it("escapes HTML in the text", () => {
    expect(markdownToHtml("<b>x</b>")).toBe("<p>&lt;b&gt;x&lt;/b&gt;</p>");
  });

  it("balances every list tag in the real brief", () => {
    const html = markdownToHtml(renderBrief(analyse(demoSnapshot())));
    for (const tag of ["ol", "ul", "li"]) {
      expect((html.match(new RegExp(`<${tag}>`, "g")) ?? []).length, tag).toBe((html.match(new RegExp(`</${tag}>`, "g")) ?? []).length);
    }
  });
});
