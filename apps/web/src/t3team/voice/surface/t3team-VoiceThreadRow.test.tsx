// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { VoiceThreadRow } from "./t3team-VoiceThreadRow";
import { VOICE_HEARD_FLASH_MS } from "./t3team-voiceSessionNote";
import { IDLE_VOICE_UI, type VoiceUiSnapshot, type VoiceUiState } from "./t3team-voiceUiModel";
import { IDLE_VOICE_LIVE, useVoiceUiStore, type VoiceUiLive } from "./t3team-voiceUiStore";

const controls = { toggle: vi.fn(), dismiss: vi.fn(), openMicrophoneSettings: vi.fn() };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function show(
  state: VoiceUiState,
  snapshot: Partial<VoiceUiSnapshot> = {},
  live: Partial<VoiceUiLive> = {},
) {
  act(() =>
    useVoiceUiStore.setState({
      snapshot: { ...IDLE_VOICE_UI, state, ...snapshot },
      live: { ...IDLE_VOICE_LIVE, ...live },
    }),
  );
}

function mount(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(node);
  });
}

const row = (
  props: {
    isActive?: boolean;
    onOpen?: () => void;
    onContextMenu?: (position: { x: number; y: number }) => void;
  } = {},
) => (
  <VoiceThreadRow
    title="Voice thread #592"
    isActive={props.isActive ?? false}
    keys={[]}
    {...props}
  />
);
const rowButton = () => container!.querySelector<HTMLButtonElement>("button:not([aria-label])")!;
const orb = (label: string) =>
  container!.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.values(controls).forEach((fn) => fn.mockReset());
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: true }),
    configurable: true,
  });
  useVoiceUiStore.setState({ snapshot: IDLE_VOICE_UI, live: IDLE_VOICE_LIVE, controls });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe("the voice row is one click target", () => {
  it("opens the thread from the title area, and the orb records without opening", () => {
    const onOpen = vi.fn();
    mount(row({ onOpen }));
    act(() => rowButton().click());
    expect(onOpen).toHaveBeenCalledOnce();
    expect(controls.toggle).not.toHaveBeenCalled();
    act(() => orb("Talk").click());
    expect(controls.toggle).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("records when the thread is already open, instead of doing nothing", () => {
    const onOpen = vi.fn();
    mount(row({ onOpen, isActive: true }));
    act(() => rowButton().click());
    expect(controls.toggle).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("records from the row when there is no thread yet", () => {
    mount(row());
    act(() => rowButton().click());
    expect(controls.toggle).toHaveBeenCalledOnce();
  });

  it("stays clickable while recording and while a pass writes", () => {
    const onOpen = vi.fn();
    show("recording", { startedAtMs: Date.now() }, { writing: 1, writingSinceMs: Date.now() });
    mount(row({ onOpen }));
    act(() => rowButton().click());
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe("the voice row is honest about what it is doing", () => {
  it("shows the title only at rest", () => {
    mount(row());
    expect(container!.textContent).toContain("Voice thread #592");
    show("recording", { startedAtMs: Date.now() });
    expect(container!.textContent).not.toContain("Voice thread #592");
  });

  it("counts a final pass in seconds while the recording stays open", () => {
    const since = Date.now();
    show("recording", { startedAtMs: since }, { writing: 1, writingSinceMs: since });
    mount(row());
    expect(container!.textContent).toContain("Transcribing…");
    expect(container!.textContent).not.toContain("Transcribing… 1 s");
    for (let second = 0; second < 3; second += 1) act(() => vi.advanceTimersByTime(1_100));
    expect(container!.textContent).toContain("Transcribing… 3 s");
    expect(orb("Stop recording")).not.toBeNull();
    expect(orb("Stop recording").disabled).toBe(false);
  });

  it("counts the final pass after the recording was ended", () => {
    show("transcribing", { startedAtMs: Date.now() - 9_000, endedAtMs: Date.now() - 4_000 });
    mount(row());
    expect(container!.textContent).toContain("Transcribing… 4 s");
  });

  it("says heard for a moment, then listens again", () => {
    show(
      "recording",
      { startedAtMs: Date.now() - 5_000 },
      { heard: { text: "open the board", atMs: Date.now() } },
    );
    mount(row());
    expect(container!.textContent).toContain("heard");
    act(() => vi.advanceTimersByTime(VOICE_HEARD_FLASH_MS + 100));
    expect(container!.textContent).not.toContain("heard");
    expect(container!.querySelector("canvas")).not.toBeNull();
  });

  it("counts a wait for the model when there is no download to report", () => {
    show("preparing");
    mount(row());
    expect(container!.textContent).toContain("Preparing…");
    act(() => vi.advanceTimersByTime(12_100));
    expect(container!.textContent).toContain("Preparing… 12 s");
  });

  it("shows a real percentage while the model downloads", () => {
    show("preparing", { downloadPercent: 37 });
    mount(row());
    expect(container!.textContent).toContain("37%");
    expect(container!.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe(
      "37",
    );
  });
});

describe("the voice row looks like a thread row", () => {
  const surface = () => container!.querySelector<HTMLElement>('[data-testid="voice-thread-row"]')!;

  it("wears the regular row surface, a size more compact, with no card, border or tint", () => {
    for (const state of ["idle", "transcribing", "committed", "failed"] as const) {
      show(state, { startedAtMs: Date.now() });
      mount(row());
      const classes = surface().className.split(/\s+/);
      expect(classes).toEqual(expect.arrayContaining(["h-7", "rounded-md", "bg-transparent"]));
      expect(classes).toContain("hover:bg-sidebar-row-hover");
      for (const special of ["border", "border-border", "bg-card", "rounded-lg", "h-8"]) {
        expect(classes).not.toContain(special);
      }
      act(() => root?.unmount());
      container?.remove();
    }
  });

  it("uses the shared active fill when its thread is open", () => {
    mount(row({ isActive: true }));
    expect(surface().className).toContain("bg-sidebar-row-active");
    expect(surface().className).not.toContain("bg-transparent");
  });

  it("opens its menu at the pointer on right-click, only when the host offers one", () => {
    const onContextMenu = vi.fn();
    mount(row({ onContextMenu }));
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperties(event, { clientX: { value: 40 }, clientY: { value: 12 } });
    act(() => surface().dispatchEvent(event));
    expect(onContextMenu).toHaveBeenCalledWith({ x: 40, y: 12 });
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves the browser menu alone without a host menu (the start row)", () => {
    mount(row());
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => surface().dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("the voice row never doubles its icon or adds chrome", () => {
  const middle = () => container!.querySelector<HTMLButtonElement>("button:not([aria-label])")!;

  it("says heard once: the check is the orb's, the label is the plain word", () => {
    show("committed", { heardText: "hi" });
    mount(row());
    expect(middle().textContent).toBe("heard");
    expect(middle().querySelector("svg")).toBeNull();
    expect(orb("Talk").getAttribute("data-state")).toBe("committed");
  });

  it("keeps every state's label free of icons and glyphs", () => {
    for (const state of [
      "idle",
      "transcribing",
      "committed",
      "preparing",
      "failed",
      "denied",
    ] as const) {
      show(state, { startedAtMs: Date.now(), endedAtMs: Date.now() });
      mount(row());
      expect(middle().querySelector("svg")).toBeNull();
      expect(middle().textContent).not.toMatch(/[✓✔✗✕❌⚠]/u);
      act(() => root?.unmount());
      container?.remove();
    }
  });

  it("adds no border, ring, outline or tint in any state, open or not", () => {
    for (const isActive of [false, true]) {
      for (const state of ["idle", "transcribing", "committed", "failed", "denied"] as const) {
        show(state, { startedAtMs: Date.now() });
        mount(row({ isActive }));
        const classes = [...container!.querySelectorAll<HTMLElement>("*")]
          .flatMap((element) => (element.getAttribute("class") ?? "").split(/\s+/))
          // Keyboard focus rings are the same ones a thread row and its quick actions use.
          .filter((name) => name !== "" && !name.startsWith("focus-visible:"));
        expect(
          classes.filter((name) =>
            /^(border|ring|outline-(?!hidden)|shadow|bg-primary|bg-card)/.test(name),
          ),
        ).toEqual([]);
        act(() => root?.unmount());
        container?.remove();
      }
    }
  });
});
