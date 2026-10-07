import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { remarkExplainerInlineHtml } from "./t3team-explainerMarkdownHtml";

const render = (markdown: string) =>
  renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkExplainerInlineHtml]}>
      {markdown}
    </ReactMarkdown>,
  );

describe("remarkExplainerInlineHtml", () => {
  it("renders the inline subset as formatting", () => {
    expect(render("a <b>bold</b>, <em>soft</em> and <kbd>Esc</kbd>")).toBe(
      "<p>a <strong>bold</strong>, <em>soft</em> and <kbd>Esc</kbd></p>",
    );
    expect(render("H<sub>2</sub>O and x<sup>2</sup>")).toBe(
      "<p>H<sub>2</sub>O and x<sup>2</sup></p>",
    );
    expect(render("run <code>a &lt; b</code>")).toBe("<p>run <code>a &lt; b</code></p>");
  });

  it("nests formatting and closes stray elements", () => {
    expect(render("<b>one <i>two</i></b> and <b>open")).toBe(
      "<p><strong>one <em>two</em></strong> and <strong>open</strong></p>",
    );
  });

  it("turns br into a line break", () => {
    expect(render("one<br>two<br/>three")).toBe("<p>one<br/>\ntwo<br/>\nthree</p>");
  });

  it("drops every other tag but keeps its text, never showing tags as text", () => {
    const html = render(
      '<span style="x" onclick="evil()">hi</span> <a href="https://x.test">go</a> <img src="https://x.test/p.png">',
    );
    expect(html).toBe("<p>hi go </p>");
    expect(html).not.toContain("&lt;");
    expect(html).not.toContain("href");
    expect(html).not.toContain("onclick");
  });

  it("drops script and style content", () => {
    expect(render("a<script>alert(1)</script>b <style>p{}</style>c")).toBe("<p>ab c</p>");
  });

  it("keeps attributes off formatting tags", () => {
    expect(render('<b onclick="evil()" class="x">ok</b>')).toBe("<p><strong>ok</strong></p>");
  });

  it("handles block-level html as plain paragraphs", () => {
    expect(render("<div>one <b>two</b></div>\n\nafter")).toBe(
      "<p>one <strong>two</strong></p>\n<p>after</p>",
    );
    expect(render("<!-- note -->\n\nafter")).toBe("<p>after</p>");
  });

  it("leaves fenced and inline code literal", () => {
    expect(render("`<b>x</b>`\n\n```\n<b>y</b>\n```")).toBe(
      "<p><code>&lt;b&gt;x&lt;/b&gt;</code></p>\n<pre><code>&lt;b&gt;y&lt;/b&gt;\n</code></pre>",
    );
  });
});
