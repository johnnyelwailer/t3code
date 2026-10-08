// @vitest-environment jsdom
import { act } from "react";
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

async function render(text: string): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  await act(async () => root.render(<PackMarkdown text={text} />));
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
});
