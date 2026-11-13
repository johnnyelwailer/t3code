import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { T3TeamImageLightbox } from "~/t3team/components/media/t3team-ImageLightbox";
import { LinkedRepositoriesDialogView } from "~/t3team/components/t3team-LinkedRepositoriesDialogView";
import { CreateProjectPageHeader } from "~/t3team/t3team-CreateProjectPageHeader";
import { WelcomePageShell } from "~/t3team/welcome/t3team-NexiWelcomeShell";
import { render, type Screen } from "../../test/render";

type ChromeMetrics = {
  insetEnd: number;
  insetStart: number;
  width: number;
  height: number;
  side: "left" | "right";
};

/** Simulated Windows caption-button cluster (min/max/close), top-right. */
const WIN: ChromeMetrics = { insetEnd: 138, insetStart: 12, width: 138, height: 36, side: "right" };
/** Simulated macOS traffic lights; product inset is 90px. */
const MAC: ChromeMetrics = { insetEnd: 12, insetStart: 90, width: 78, height: 32, side: "left" };

function applyChrome(platform: "win" | "mac") {
  const metrics = platform === "win" ? WIN : MAC;
  const root = document.documentElement;
  root.classList.toggle("wco", platform === "win");
  root.style.setProperty("--workspace-native-controls-inset", `${metrics.insetEnd}px`);
  root.style.setProperty("--workspace-controls-left", `${metrics.insetStart}px`);
  return metrics;
}

function clearChrome() {
  const root = document.documentElement;
  root.classList.remove("wco");
  root.style.removeProperty("--workspace-native-controls-inset");
  root.style.removeProperty("--workspace-controls-left");
  document.getElementById("simulated-native-controls")?.remove();
}

function placeSimulatedControls(
  metrics: ChromeMetrics,
  platform: "win" | "mac",
  host: HTMLElement,
  position: "absolute" | "fixed" = "absolute",
): HTMLElement {
  document.getElementById("simulated-native-controls")?.remove();
  const el = document.createElement("div");
  el.id = "simulated-native-controls";
  el.setAttribute("data-platform", platform);
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position,
    top: "0",
    [metrics.side]: "0",
    width: `${metrics.width}px`,
    height: `${metrics.height}px`,
    zIndex: "9999",
    pointerEvents: "none",
  });
  host.append(el);
  return el;
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

/** The ink of a full-size centered title, not its inset-0 positioning wrapper. */
function textBox(el: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect();
}

function interactiveControls(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>("button, a, input, [role='button']")].filter(
    (el) => el.id !== "simulated-native-controls" && el.getClientRects().length > 0,
  );
}

function overlappingControls(scope: ParentNode, chrome: HTMLElement): string[] {
  const chromeBox = chrome.getBoundingClientRect();
  return interactiveControls(scope)
    .filter((el) => intersects(el.getBoundingClientRect(), chromeBox))
    .map((el) => el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName);
}

type Mounted = AsyncDisposable & {
  readonly screen: Screen;
  readonly chrome: HTMLElement;
  readonly frame: HTMLElement;
};

async function mountWindow(
  platform: "win" | "mac",
  ui: Parameters<typeof render>[0],
  size: { width: number; height: number } = { width: 1280, height: 720 },
): Promise<Mounted> {
  const metrics = applyChrome(platform);
  const frame = document.createElement("div");
  frame.setAttribute("data-chrome-frame", "");
  Object.assign(frame.style, {
    width: `${size.width}px`,
    height: `${size.height}px`,
    position: "relative",
    overflow: "hidden",
  });
  const screen = await render(ui, { router: false, container: frame });
  const chrome = placeSimulatedControls(metrics, platform, frame);
  return {
    screen,
    chrome,
    frame,
    async [Symbol.asyncDispose]() {
      await screen[Symbol.asyncDispose]();
      clearChrome();
    },
  };
}

describe("window chrome safe area", () => {
  it("keeps the Add-a-Jira-project close clear of Windows caption buttons", async () => {
    await using mounted = await mountWindow(
      "win",
      <CreateProjectPageHeader entry={null} onClose={() => {}} dismissible />,
    );
    const close = mounted.screen.container.querySelector('[aria-label="Close"]');
    expect(close).toBeTruthy();
    expect(overlappingControls(mounted.screen.container, mounted.chrome)).toEqual([]);
    expect(close!.getBoundingClientRect().right).toBeLessThanOrEqual(
      mounted.chrome.getBoundingClientRect().left + 0.5,
    );
  });

  it("keeps the Add-a-Jira-project title clear of macOS traffic lights", async () => {
    await using mounted = await mountWindow(
      "mac",
      <CreateProjectPageHeader entry={null} onClose={() => {}} dismissible />,
    );
    const title = [...mounted.screen.container.querySelectorAll("h1")].find((el) =>
      (el.textContent ?? "").includes("Add a Jira project"),
    );
    expect(title).toBeTruthy();
    expect(intersects(title!.getBoundingClientRect(), mounted.chrome.getBoundingClientRect())).toBe(
      false,
    );
    expect(title!.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      mounted.chrome.getBoundingClientRect().right - 0.5,
    );
    expect(overlappingControls(mounted.screen.container, mounted.chrome)).toEqual([]);
  });

  it("keeps the linked-repositories close clear of Windows caption buttons", async () => {
    await using mounted = await mountWindow(
      "win",
      <LinkedRepositoriesDialogView
        projectTitle="Project Alpha"
        linkedUrls={["https://github.com/example/one"]}
        mainRepositoryUrl="https://github.com/example/one"
        onMakeMain={vi.fn()}
        onClose={vi.fn()}
      />,
      { width: 1280, height: 800 },
    );
    const close = mounted.screen.container.querySelector('[aria-label="Close dialog"]');
    expect(close).toBeTruthy();
    expect(overlappingControls(mounted.screen.container, mounted.chrome)).toEqual([]);
    expect(close!.getBoundingClientRect().right).toBeLessThanOrEqual(
      mounted.chrome.getBoundingClientRect().left + 0.5,
    );
  });

  it("keeps the welcome title bar clear of Windows caption buttons and macOS traffic lights", async () => {
    {
      await using win = await mountWindow(
        "win",
        <WelcomePageShell title="Set up Nexi Work" platform="Win32">
          <p>Agents</p>
        </WelcomePageShell>,
      );
      expect(overlappingControls(document, win.chrome)).toEqual([]);
    }
    {
      await using mac = await mountWindow(
        "mac",
        <WelcomePageShell title="Set up Nexi Work" platform="MacIntel">
          <p>Agents</p>
        </WelcomePageShell>,
      );
      expect(overlappingControls(document, mac.chrome)).toEqual([]);
      const title = [...document.querySelectorAll("span")].find((el) =>
        (el.textContent ?? "").includes("Set up Nexi Work"),
      );
      expect(title).toBeTruthy();
      expect(intersects(textBox(title!), mac.chrome.getBoundingClientRect())).toBe(false);
    }
  });

  it("keeps the image-lightbox close clear of Windows caption buttons", async () => {
    const metrics = applyChrome("win");
    const chrome = placeSimulatedControls(metrics, "win", document.body, "fixed");
    await using _screen = await render(
      <T3TeamImageLightbox
        images={[{ src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", alt: "Example" }]}
        index={0}
        onClose={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />,
      { router: false },
    );
    try {
      const close = document.querySelector('[aria-label="Close image viewer"]');
      expect(close).toBeTruthy();
      expect(overlappingControls(document, chrome)).toEqual([]);
      expect(close!.getBoundingClientRect().right).toBeLessThanOrEqual(
        chrome.getBoundingClientRect().left + 0.5,
      );
    } finally {
      clearChrome();
    }
  });
});
