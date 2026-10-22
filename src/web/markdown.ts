import { escapeHtml } from "../render/deck.js";

// Just enough Markdown for brief.md: headings, paragraphs, numbered and
// bulleted lists (one level of nesting), task boxes, **bold** and `code`.

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function item(text: string): string {
  const task = text.match(/^\[( |x)\] (.*)$/);
  if (!task) return inline(text);
  return `<label class="task"><input type="checkbox"${task[1] === "x" ? " checked" : ""}> <span>${inline(task[2]!)}</span></label>`;
}

export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let list: "ol" | "ul" | null = null;
  let subOpen = false;
  let itemOpen = false;

  const closeSub = () => {
    if (subOpen) out.push("</ul>");
    subOpen = false;
  };
  const closeItem = () => {
    closeSub();
    if (itemOpen) out.push("</li>");
    itemOpen = false;
  };
  const closeList = () => {
    closeItem();
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const sub = line.match(/^ {2,}- (.*)$/);
    const ordered = line.match(/^\d+\. (.*)$/);
    const bullet = line.match(/^- (.*)$/);
    const heading = line.match(/^(#{1,3}) (.*)$/);

    if (sub && itemOpen) {
      if (!subOpen) out.push("<ul>");
      subOpen = true;
      out.push(`<li>${item(sub[1]!)}</li>`);
    } else if (ordered || bullet) {
      const kind = ordered ? "ol" : "ul";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      } else {
        closeItem();
      }
      out.push(`<li>${item((ordered ?? bullet)![1]!)}`);
      itemOpen = true;
    } else if (heading) {
      closeList();
      const level = heading[1]!.length + 1;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (line === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}
