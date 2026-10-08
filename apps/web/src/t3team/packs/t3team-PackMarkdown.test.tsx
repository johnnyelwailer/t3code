// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { PackMarkdown } from "./t3team-PackMarkdown";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const containers: HTMLElement[] = [];
afterEach(() => {
  for (const container of containers.splice(0)) container.remove();
});

async function render(
  text: string,
  props: Omit<ComponentProps<typeof PackMarkdown>, "text"> = {},
): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => root.render(<PackMarkdown text={text} {...props} />));
  return container;
}

describe("pack-ui Markdown", () => {
  it("shows raw HTML as text and never turns it into elements", async () => {
    const container = await render('See <a href="file:///etc/hosts">x</a> here.');

    expect(container.querySelector('a[href^="file:"]')).toBeNull();
    expect(container.textContent).toContain('<a href="file:///etc/hosts">x</a>');
  });

  it("still renders markdown", async () => {
    const container = await render("**bold** and [docs](https://example.com)");

    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull();
  });

  it("renders a file: link, autolink or reference as its text, with no link", async () => {
    const container = await render(
      [
        "[hosts](file:///etc/hosts)",
        "<file:///etc/passwd>",
        "[ref][r]",
        "[app](/settings) [js](javascript:alert(1)) [ok](#step-2)",
        "",
        "[r]: file:///etc/shadow",
      ].join(" \n"),
    );

    expect(container.querySelector('a[href^="file:"]')).toBeNull();
    expect(container.querySelector('a[href^="/"]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('a[href="#step-2"]')).not.toBeNull();
    expect(container.textContent).toContain("hosts");
    expect(container.textContent).toContain("ref");
  });

  it("never loads an image from a URL; an inline data image still renders", async () => {
    const pixel = "data:image/png;base64,iVBORw0KGgo=";
    const container = await render(`![tracker](https://example.com/p.png) ![dot](${pixel})`);

    const images = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(images.some((src) => src?.startsWith("https:"))).toBe(false);
    expect(container.textContent).toContain("[tracker]");
  });

  it("runs pack remark plugins before the URL policy", async () => {
    const addFileLink = () => (tree: { type: string; children?: unknown[] }) => {
      tree.children?.push({
        type: "paragraph",
        children: [{ type: "link", url: "/settings", children: [{ type: "text", value: "x" }] }],
      });
    };
    const container = await render("text", { remarkPlugins: [addFileLink] });

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("x");
  });

  it("never resolves a reference to an unsafe definition that shares its label", async () => {
    const container = await render(
      ["[go][r]", "", "[r]: file:///etc/hosts", "[R]: https://example.com"].join("\n"),
    );

    expect(container.querySelector('a[href^="file:"]')).toBeNull();
    expect(container.querySelector('a[href^="/"]')).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });
});
