// @vitest-environment jsdom
/**
 * Widget theme re-sync: the host theme is SNAPSHOT into the sandboxed iframe's srcdoc at build
 * time (an iframe :root cannot inherit the host's CSS custom properties), so the block
 * controller must rebuild the srcdoc when the resolved theme changes. This locks the
 * useTheme()-subscribed dependency: exactly one re-snapshot on a real light/dark flip, none on
 * plain re-renders — otherwise widgets stay frozen on the mount-time palette (dark content in a
 * light shell, or vice versa) until the page reloads.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi, type Mock } from "vite-plus/test";

vi.mock("~/state/entities", () => ({ useThread: () => null }));
// Each snapshot call gets a distinct marker, so a rebuilt srcdoc is observable: if the
// controller ever re-snapshots, the marker number in the iframe's srcdoc must advance.
let snapshotCalls = 0;
vi.mock("~/t3team/chat/t3team-widgetSrcdoc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/t3team/chat/t3team-widgetSrcdoc")>();
  return {
    ...actual,
    collectT3TeamWidgetThemeCss: vi.fn(
      () => `:root { --background: snapshot-${++snapshotCalls}; }`,
    ),
  };
});

import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";
import { collectT3TeamWidgetThemeCss } from "~/t3team/chat/t3team-widgetSrcdoc";

const collectMock = collectT3TeamWidgetThemeCss as unknown as Mock;

const widget = {
  widgetId: "theme-resync-1",
  title: "theme_resync",
  format: "html" as const,
  html: "<div id='resync'>themed</div>",
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
  collectMock.mockClear();
  snapshotCalls = 0;
  window.localStorage.removeItem("t3code:theme");
  document.documentElement.classList.remove("dark");
});

function renderBlock() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(<T3TeamWidgetBlock widget={widget} threadRef={null} />);
  });
  const iframe = container.querySelector("iframe");
  if (!iframe) throw new Error("iframe not rendered");
  return iframe;
}

describe("T3TeamWidgetBlock theme re-snapshot", () => {
  it("snaps the host theme into the srcdoc on mount", () => {
    const iframe = renderBlock();
    expect(collectMock).toHaveBeenCalledTimes(1);
    expect(iframe.srcdoc).toContain("--background: snapshot-1");
  });

  it("re-snapshots exactly once when the resolved theme flips light → dark", () => {
    const iframe = renderBlock();
    expect(iframe.srcdoc).toContain("--background: snapshot-1");
    expect(collectMock).toHaveBeenCalledTimes(1);

    // The same-tab path writes the preference; the storage event is the store's documented
    // change channel (cross-tab and same-tab alike).
    act(() => {
      window.localStorage.setItem("t3code:theme", "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "t3code:theme" }));
    });

    expect(collectMock).toHaveBeenCalledTimes(2); // one extra snapshot for the theme flip
    // The rebuilt srcdoc is what reaches the iframe element: the advanced marker proves the
    // new snapshot crossed into the live DOM, not just that the memo re-ran somewhere.
    expect(iframe.srcdoc).toContain("--background: snapshot-2");
    expect(iframe.srcdoc).not.toContain("--background: snapshot-1");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not re-snapshot on a plain re-render with an unchanged theme", () => {
    const iframe = renderBlock();
    const before = iframe.srcdoc;
    act(() => {
      root!.render(<T3TeamWidgetBlock widget={widget} threadRef={null} />);
    });
    expect(collectMock).toHaveBeenCalledTimes(1); // theme snapshot identity must stay stable
    expect(iframe.srcdoc).toBe(before);
    expect(iframe.srcdoc).toContain("--background: snapshot-1");
  });
});
