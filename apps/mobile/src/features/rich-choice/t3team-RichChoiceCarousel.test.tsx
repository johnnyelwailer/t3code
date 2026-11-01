import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

type Props = Record<string, unknown> & { children?: ReactNode };

const env = vi.hoisted(() => ({
  reduced: false,
  motionCalls: [] as string[],
  announced: [] as string[],
  os: "android" as "android" | "ios",
  panEnd: undefined as ((event: { translationX: number }) => void) | undefined,
}));

vi.mock("react-native", () => ({
  View: ({ children, accessibilityLabel, accessibilityElementsHidden }: Props) => (
    <div aria-label={accessibilityLabel as string} hidden={accessibilityElementsHidden === true}>
      {children}
    </div>
  ),
  Pressable: ({
    children,
    onPress,
    disabled,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
  }: Props) => {
    const state = (accessibilityState ?? {}) as { selected?: boolean; disabled?: boolean };
    return (
      <button
        type="button"
        data-role={accessibilityRole as string}
        aria-label={accessibilityLabel as string}
        data-selected={String(state.selected ?? false)}
        aria-disabled={state.disabled === true}
        disabled={disabled === true}
        onClick={onPress as () => void}
      >
        {children}
      </button>
    );
  },
  StyleSheet: { absoluteFill: {} },
  AccessibilityInfo: {
    announceForAccessibility: (message: string) => void env.announced.push(message),
  },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("./t3team-richChoiceAnnounce", () => ({
  announcesViaLiveRegion: () => env.os === "android",
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children, style }: Props) => <div data-style={JSON.stringify(style)}>{children}</div>,
  },
  Easing: { linear: "linear" },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => env.reduced,
  useSharedValue: (value: number) => ({ get: () => value, set: () => {} }),
  withSpring: (value: number) => (env.motionCalls.push("spring"), value),
  withTiming: (value: number, config?: { duration?: number }) => (
    env.motionCalls.push(`timing:${config?.duration}`),
    value
  ),
  runOnJS: (fn: unknown) => fn,
}));
vi.mock("react-native-gesture-handler", () => ({
  GestureDetector: ({ children }: Props) => children,
  Gesture: {
    Pan: () => {
      const pan = {
        activeOffsetX: () => pan,
        failOffsetY: () => pan,
        onUpdate: () => pan,
        onEnd: (callback: typeof env.panEnd) => ((env.panEnd = callback), pan),
        onFinalize: () => pan,
      };
      return pan;
    },
  },
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children, accessibilityLiveRegion }: Props) => (
    <span data-live={accessibilityLiveRegion as string}>{children}</span>
  ),
}));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/Button", () => ({
  Button: ({ label, disabled, onPress }: Props) => (
    <button
      type="button"
      aria-label={label as string}
      disabled={disabled === true}
      onClick={onPress as () => void}
    >
      {label as string}
    </button>
  ),
}));

import { T3TeamRichChoiceCarousel } from "./t3team-RichChoiceCarousel";

const options = [
  { id: "a", title: "Alpha", body: "First body", tag: "ROLE", chips: ["chip one"] },
  { id: "b", title: "Beta", body: "Second body" },
  { id: "c", title: "Gamma", body: "Third body" },
];

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.();
  env.reduced = false;
  env.os = "android";
  env.motionCalls.length = 0;
  env.announced.length = 0;
});

function mount(props: Partial<Parameters<typeof T3TeamRichChoiceCarousel>[0]> = {}) {
  const onChoose = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push(() => act(() => root.unmount()));
  act(() =>
    root.render(
      <T3TeamRichChoiceCarousel
        prompt="Pick a role"
        options={options}
        onChoose={onChoose}
        {...props}
      />,
    ),
  );
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  return {
    container,
    onChoose,
    button,
    click: (label: string) => act(() => button(label)?.click()),
    live: () => container.querySelector("[data-live]")?.textContent,
  };
}

/** The scale each slide animates to, front first. */
function slideScales(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>("[data-style]")].flatMap((node) => {
    const style = JSON.parse(node.dataset.style ?? "[]") as Array<{
      transform?: Array<{ scale?: number }>;
    }>;
    const scale = style.flatMap((part) => part.transform ?? []).find((t) => t.scale !== undefined);
    return scale?.scale === undefined ? [] : [scale.scale];
  });
}

describe("T3TeamRichChoiceCarousel", () => {
  it("shows every card as text, the explicit action only on the front card, and announces the front card", () => {
    const view = mount();
    expect(view.container.textContent).toContain("Alpha");
    expect(view.container.textContent).toContain("Gamma");
    expect(view.container.querySelectorAll('button[aria-label="Choose this"]')).toHaveLength(1);
    expect(view.live()).toBe("1 of 3: Alpha");
    expect(view.container.querySelector('[aria-label="What this changes"]')).not.toBeNull();
  });

  it("opens on the default option", () => {
    expect(mount({ defaultId: "c" }).live()).toBe("3 of 3: Gamma");
  });

  it("chooses the front card with the explicit action", () => {
    const view = mount();
    view.click("Choose this");
    expect(view.onChoose).toHaveBeenCalledWith(["a"]);
  });

  it("moves the front card on a swipe through the shared threshold and never chooses", () => {
    const view = mount();
    act(() => env.panEnd?.({ translationX: -10 }));
    expect(view.live()).toBe("1 of 3: Alpha");
    act(() => env.panEnd?.({ translationX: -200 }));
    expect(view.live()).toBe("2 of 3: Beta");
    act(() => env.panEnd?.({ translationX: 200 }));
    expect(view.live()).toBe("1 of 3: Alpha");
    act(() => env.panEnd?.({ translationX: 200 }));
    expect(view.live()).toBe("1 of 3: Alpha");
    expect(view.onChoose).not.toHaveBeenCalled();
    act(() => env.panEnd?.({ translationX: -200 }));
    view.click("Choose this");
    expect(view.onChoose).toHaveBeenCalledWith(["b"]);
  });

  it("steps with previous and next, the dots and a tap on a peeking card", () => {
    const view = mount();
    expect(view.button("Previous")?.disabled).toBe(true);
    view.click("Next");
    expect(view.live()).toBe("2 of 3: Beta");
    view.click("3 of 3: Gamma");
    expect(view.live()).toBe("3 of 3: Gamma");
    expect(view.button("Next")?.disabled).toBe(true);
    view.click("Previous");
    view.click("Show 1 of 3: Alpha");
    expect(view.live()).toBe("1 of 3: Alpha");
    expect(env.announced).toEqual([]);
    expect(view.onChoose).not.toHaveBeenCalled();
    expect(view.button("1 of 3: Alpha")?.dataset.selected).toBe("true");
    expect(view.button("2 of 3: Beta")?.dataset.selected).toBe("false");
  });

  it("announces each move once: through the live region on Android, explicitly on iOS", () => {
    const android = mount();
    android.click("Next");
    expect(android.live()).toBe("2 of 3: Beta");
    expect(env.announced).toEqual([]);

    env.os = "ios";
    const ios = mount();
    expect(ios.container.querySelector("[data-live]")).toBeNull();
    ios.click("Next");
    ios.click("Next");
    expect(env.announced).toEqual(["2 of 3: Beta", "3 of 3: Gamma"]);
  });

  it("collects picks in a multiple choice and confirms them together", () => {
    const view = mount({ multiple: true });
    expect(view.button("Confirm")?.disabled).toBe(true);
    view.click("Choose this");
    expect(view.button("Added")?.dataset.selected).toBe("true");
    expect(view.button("Added")?.dataset.role).toBe("togglebutton");
    expect(view.button("Confirm (1)")?.disabled).toBe(false);
    view.click("Next");
    view.click("Choose this");
    expect(view.button("Confirm (2)")).not.toBeNull();
    view.click("Added");
    expect(view.button("Confirm (1)")).not.toBeNull();
    view.click("Previous");
    view.click("Confirm (1)");
    expect(view.onChoose).toHaveBeenCalledWith(["a"]);
  });

  it("keeps browsing but stops choosing while disabled", () => {
    const view = mount({ disabled: true });
    expect(view.button("Choose this")?.disabled).toBe(true);
    expect(view.button("Choose this")?.getAttribute("aria-disabled")).toBe("true");
    view.click("Choose this");
    expect(view.onChoose).not.toHaveBeenCalled();
    view.click("Next");
    expect(view.live()).toBe("2 of 3: Beta");
  });

  it("marks already chosen options and disables the confirm of a locked multiple choice", () => {
    const view = mount({ selectedIds: ["b"], disabled: true });
    expect(view.container.textContent).toContain("Chosen");
    const multiple = mount({ multiple: true, selectedIds: ["b"], disabled: true });
    expect(multiple.button("Confirm (1)")?.disabled).toBe(true);
  });

  it("springs and scales peeking cards normally", () => {
    const view = mount();
    expect(env.motionCalls).toContain("spring");
    expect(slideScales(view.container)).toEqual([1, 0.94, 0.94]);
  });

  it("uses a plain short timing with no spring and no scale when motion is reduced", () => {
    env.reduced = true;
    const view = mount();
    expect(env.motionCalls).toContain("timing:150");
    expect(env.motionCalls).not.toContain("spring");
    expect(slideScales(view.container)).toEqual([1, 1, 1]);
  });

  it("hides the content of peeking cards from assistive tech", () => {
    const view = mount();
    const hidden = [...view.container.querySelectorAll("div[hidden]")];
    expect(hidden.map((node) => node.getAttribute("aria-label"))).toEqual([
      "2 of 3: Beta",
      "3 of 3: Gamma",
    ]);
  });

  it("renders titles and bodies from an agent as text, never as markup", () => {
    const hostile = "<img src=x onerror=alert(1)> **bold** [x](javascript:alert(1))";
    const view = mount({
      options: [
        {
          id: "a",
          title: hostile,
          body: `<script>alert(1)</script>\n\n<b>second</b>`,
          tag: "<i>t</i>",
        },
      ],
    });
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("script")).toBeNull();
    expect(view.container.querySelector("b")).toBeNull();
    expect(view.container.textContent).toContain(hostile);
    expect(view.container.textContent).toContain("<script>alert(1)</script>");
  });
});
