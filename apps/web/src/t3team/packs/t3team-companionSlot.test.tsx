// @vitest-environment jsdom
/**
 * `surface.companion` end to end against the app registry: with nothing registered every
 * placement shows the surface's own fallback; a pack fills only the placements it lists; the first
 * registration of a placement wins; a companion that throws gives the fallback back; companions
 * switched off show the fallback. The registry is one per page, so the empty tests run first.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { activateAppViewPacks, appViewRegistry } from "./t3team-appViewRegistry";
import {
  CompanionPreferencesContext,
  companionFor,
  T3TeamCompanionSlot,
  useJustCleared,
} from "./t3team-CompanionSlot";
import {
  blobCompanionPackWebModule,
  grumpyCompanionPackWebModule,
} from "./t3team-companionPackFixtures";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const render = (node: ReactNode) => act(() => root.render(node));
const mark = <span data-testid="mark">mark</span>;
const companionsOff = { enabled: false, quality: "auto" } as const;
const lowQuality = { enabled: true, quality: "low" } as const;

describe("with nothing registered", () => {
  it("renders the fallback, or nothing without one", () => {
    render(
      <T3TeamCompanionSlot placement="myWork.loading" mood="loading" size="sm" fallback={mark} />,
    );
    expect(container.innerHTML).toBe('<span data-testid="mark">mark</span>');

    render(<T3TeamCompanionSlot placement="thread.new" mood="newThread" size="md" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("with companion packs", () => {
  it("fills the placements a pack lists, and only those", () => {
    activateAppViewPacks([blobCompanionPackWebModule]);

    render(
      <T3TeamCompanionSlot placement="myWork.loading" mood="loading" size="sm" fallback={mark} />,
    );
    const blob = container.querySelector("[data-fixture=blob-companion]");
    expect(blob?.getAttribute("data-mood")).toBe("loading");
    expect(blob?.getAttribute("width")).toBe("48");
    expect(container.querySelector("[data-testid=mark]")).toBeNull();
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");

    render(<T3TeamCompanionSlot placement="thread.new" mood="newThread" size="md" />);
    expect(container.innerHTML).toBe("");
  });

  it("keeps the first registration of a placement and falls back when a companion throws", () => {
    activateAppViewPacks([grumpyCompanionPackWebModule]);
    expect(companionFor(appViewRegistry(), "myWork.empty")?.id).toBe("blob.companion");
    expect(companionFor(appViewRegistry(), "thread.new")?.id).toBe("grumpy.companion");

    render(<T3TeamCompanionSlot placement="myWork.empty" mood="empty" size="md" />);
    expect(container.querySelector("[data-fixture=blob-companion]")).not.toBeNull();

    render(
      <T3TeamCompanionSlot placement="thread.new" mood="newThread" size="md" fallback={mark} />,
    );
    expect(container.innerHTML).toBe('<span data-testid="mark">mark</span>');
  });

  it("shows the fallback when companions are switched off, and passes the quality ceiling on", () => {
    render(
      <CompanionPreferencesContext.Provider value={companionsOff}>
        <T3TeamCompanionSlot placement="myWork.loading" mood="loading" size="sm" fallback={mark} />
      </CompanionPreferencesContext.Provider>,
    );
    expect(container.querySelector("[data-testid=mark]")).not.toBeNull();

    render(
      <CompanionPreferencesContext.Provider value={lowQuality}>
        <T3TeamCompanionSlot placement="myWork.loading" mood="loading" size="sm" fallback={mark} />
      </CompanionPreferencesContext.Provider>,
    );
    expect(
      container.querySelector("[data-fixture=blob-companion]")?.getAttribute("data-quality"),
    ).toBe("low");
  });
});

describe("useJustCleared", () => {
  function Probe({ empty }: { empty: boolean }) {
    return <span>{useJustCleared(empty, 1000) ? "cleared" : "steady"}</span>;
  }

  it("is false for a surface empty from the start", () => {
    render(<Probe empty />);
    expect(container.textContent).toBe("steady");
  });

  it("is true for a while after the last item goes, then settles", () => {
    vi.useFakeTimers();
    render(<Probe empty={false} />);
    render(<Probe empty />);
    expect(container.textContent).toBe("cleared");
    act(() => vi.advanceTimersByTime(1001));
    expect(container.textContent).toBe("steady");
    render(<Probe empty={false} />);
    expect(container.textContent).toBe("steady");
  });
});
