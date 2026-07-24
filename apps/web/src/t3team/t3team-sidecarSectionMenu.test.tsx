// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { T3TeamSidecarSectionFrame } from "~/t3team/t3team-sidecarSectionFrame";
import { T3TeamSidecarSectionItemMenu } from "~/t3team/t3team-sidecarSectionMenu";
import type { T3TeamSidecarMenuEntry } from "~/t3team/t3team-sidecarSectionMenuActions";

const MENU_ENTRIES: ReadonlyArray<T3TeamSidecarMenuEntry> = [
  {
    kind: "action",
    id: "hide",
    label: "Hide item",
    onSelect: vi.fn(),
  },
];

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(node);
  });
  return container;
}

async function dispatchMouseEvent(target: Element, type: "click" | "contextmenu") {
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...(type === "contextmenu" ? { button: 2 } : {}),
      }),
    );
  });
}

function getMenuLabels() {
  return [...document.body.querySelectorAll("[data-slot='menu-item']")].map(
    (node) => node.textContent ?? "",
  );
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }

    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }

  document.body.innerHTML = "";
});

describe("sidecar section menus", () => {
  it("opens the header menu from the hover kebab trigger", async () => {
    const container = await renderNode(
      <T3TeamSidecarSectionFrame
        sectionId="quick-starts"
        title="Quick starts"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        menuEntries={MENU_ENTRIES}
      >
        <div>content</div>
      </T3TeamSidecarSectionFrame>,
    );

    const trigger = container.querySelector("[aria-label='Quick starts actions']");
    expect(trigger).toBeTruthy();

    await dispatchMouseEvent(trigger as Element, "click");

    expect(getMenuLabels()).toContain("Hide item");
  });

  it("opens the header menu from a context menu gesture on the header row", async () => {
    const container = await renderNode(
      <T3TeamSidecarSectionFrame
        sectionId="quick-starts"
        title="Quick starts"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
        menuEntries={MENU_ENTRIES}
      >
        <div>content</div>
      </T3TeamSidecarSectionFrame>,
    );

    const headerRow = container.querySelector("[data-sidecar-section-id='quick-starts'] > div");
    expect(headerRow).toBeTruthy();

    await dispatchMouseEvent(headerRow as Element, "contextmenu");

    expect(getMenuLabels()).toContain("Hide item");
  });

  it("opens the item menu from the hover kebab trigger and from a context menu gesture", async () => {
    const container = await renderNode(
      <T3TeamSidecarSectionItemMenu entries={MENU_ENTRIES} label="Recipe one actions">
        <div>Recipe one</div>
      </T3TeamSidecarSectionItemMenu>,
    );

    const trigger = container.querySelector("[aria-label='Recipe one actions']");
    expect(trigger).toBeTruthy();
    await dispatchMouseEvent(trigger as Element, "click");
    expect(getMenuLabels()).toContain("Hide item");

    await act(async () => {
      mountedRoots.pop()?.root.unmount();
    });
    container.remove();

    const contextContainer = await renderNode(
      <T3TeamSidecarSectionItemMenu entries={MENU_ENTRIES} label="Recipe one actions">
        <div>Recipe one</div>
      </T3TeamSidecarSectionItemMenu>,
    );
    const wrapper = contextContainer.firstElementChild;
    expect(wrapper).toBeTruthy();

    await dispatchMouseEvent(wrapper as Element, "contextmenu");

    expect(getMenuLabels()).toContain("Hide item");
  });
});
