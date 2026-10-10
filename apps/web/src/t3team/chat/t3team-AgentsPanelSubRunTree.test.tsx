// @vitest-environment jsdom
/**
 * T3TeamAgentsPanelSubRunTree — GHE #254 regression:
 * the sub-run tree must use the SAME status language as the parent card
 * (ThreadActivityMorphIcon, sm variant) and the sidebar sub-run rows
 * (t3team-SidebarSubRunRow): dashed sky ring while running, a check when
 * settled, an alert icon on error, and a faded static ring when idle.
 * Before the fix every state rendered a flat `size-1.5 rounded-full`
 * colored dot, so a running child looked identical to an idle one.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const settingsState = vi.hoisted(() => ({
  activityLabelsEnabled: true,
}));

const serverConfigsState = vi.hoisted(() => ({
  configs: new Map<string, unknown>(),
}));

vi.mock("~/state/entities", () => ({
  useServerConfigs: () => serverConfigsState.configs,
}));

vi.mock("~/hooks/useSettings", () => ({
  usePrimarySettings: (selector?: (settings: Record<string, unknown>) => unknown) =>
    selector ? selector({ t3teamActivityLabelsEnabled: settingsState.activityLabelsEnabled }) : {},
}));

import type { ProjectThread } from "~/t3team/t3team-types";
import type { SubRunNode } from "./t3team-AgentsPanelForkSection.logic";
import { T3TeamAgentsPanelSubRunTree } from "./t3team-AgentsPanelSubRunTree";

function createThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: overrides.id ?? "child-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Sub-run thread",
    status: overrides.status ?? "running",
    lastMessageAt: overrides.lastMessageAt ?? new Date().toISOString(),
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    ...overrides,
  };
}

const node = (thread: ProjectThread): SubRunNode => ({ thread, children: [] });

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(nodes: SubRunNode[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root!.render(<T3TeamAgentsPanelSubRunTree nodes={nodes} onOpen={() => {}} />);
  });
}

/**
 * The ring icon is the only status svg whose <circle> carries a stroke-dasharray
 * (lucide icons carry none); the settled CircleCheckIcon and the CircleAlertIcon
 * are size-3 too and have a bare circle.
 */
function ringSvg(): SVGSVGElement | null {
  return (
    Array.from(container!.querySelectorAll("button svg circle"))
      .find((circle) => (circle as SVGCircleElement).style.strokeDasharray !== "")
      ?.closest("svg") ?? null
  );
}

/** Pack-provided providers ship `iconDataUrl`; built-ins have no data URL. */
function setProviders(
  providers: ReadonlyArray<{
    instanceId: string;
    driver: string;
    displayName: string;
    iconDataUrl?: string;
  }>,
) {
  serverConfigsState.configs = new Map([["env-1", { providers }]]);
}

/** The folded row for one sub-run title (the fold's own toggle button is not a row). */
function foldRowByTitle(title: string): HTMLElement {
  return Array.from(container!.querySelectorAll("[data-t3team-settled-fold] button")).find((b) =>
    (b.textContent ?? "").includes(title),
  ) as HTMLElement;
}

const NEXPLORE_ICON = "data:image/png;base64,bmV4cGxvcmUtbg==";

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  serverConfigsState.configs = new Map();
});

describe("T3TeamAgentsPanelSubRunTree status language (GHE #254)", () => {
  it("a child with a pending question shows the amber question mark and the awaiting label", () => {
    render([node(createThread({ status: "running", pendingUserInput: true }))]);
    // The awaiting label replaces the live state word in the row text…
    expect(container!.textContent).toContain("Question awaiting answer");
    // …and the amber question-mark glyph outranks the lifecycle icon.
    const svgs = Array.from(container!.querySelectorAll("button svg")) as SVGSVGElement[];
    const questionSvg = svgs.find((svg) =>
      svg.className.baseVal.includes("text-warning-foreground"),
    );
    expect(questionSvg, "amber question-mark icon present").toBeTruthy();
    expect(questionSvg!.className.baseVal).toContain("size-3");
  });

  it("a plan-mode child that stopped with its plan unimplemented shows the amber pending treatment", () => {
    // Same surface, same navigation as the pending question: the amber
    // question mark + the awaiting label — never a second indicator system.
    render([node(createThread({ status: "completed", awaitingParent: true }))]);
    expect(container!.textContent).toContain("Plan awaiting approval");
    const svgs = Array.from(container!.querySelectorAll("button svg")) as SVGSVGElement[];
    const pendingSvg = svgs.find((svg) =>
      svg.className.baseVal.includes("text-warning-foreground"),
    );
    expect(pendingSvg, "amber pending icon present").toBeTruthy();
  });

  it("a docked question outranks the plan-approval fact on the same row", () => {
    render([
      node(createThread({ status: "completed", awaitingParent: true, pendingUserInput: true })),
    ]);
    expect(container!.textContent).toContain("Question awaiting answer");
    expect(container!.textContent).not.toContain("Plan awaiting approval");
  });

  it("a running sub-run renders the parent's dashed ring icon (sm), not the old plain dot", () => {
    render([node(createThread({ status: "running" }))]);
    const svg = ringSvg();
    expect(svg, "ring icon svg present").toBeTruthy();
    const circle = svg!.querySelector("circle");
    // dashed ring = running state (identical language to ThreadActivityStatus
    // on the parent card; solid 62.83 dasharray is the done state)
    expect((circle as SVGCircleElement).style.strokeDasharray).toContain("7 3.44");
    expect(svg!.className.baseVal).toContain("size-3");
    expect(svg!.className.baseVal).toContain("t3team-icon-pulse");
    // the old treatment: a size-1.5 rounded-full dot — must be gone
    expect(container!.querySelector(".size-1\\.5")).toBeNull();
  });

  it("a terminal-but-not-settled sub-run stays VISIBLE (no fold); an actually-settled one folds into 'Settled (N)'", () => {
    render([
      node(createThread({ id: "idle-1", title: "Fresh idle", status: "idle" })),
      node(createThread({ id: "set-1", title: "Settled idle", status: "idle", settled: true })),
    ]);
    // The fresh idle child keeps its own visible row + dashed ring; the settled
    // one is hidden inside the single "Settled (1)" fold
    expect(container!.textContent).toContain("Fresh idle");
    expect(container!.textContent).not.toContain("Settled idle");
    expect(ringSvg(), "fresh idle row carries the ring").toBeTruthy();
    const disclosure = Array.from(container!.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Settled (1)"),
    )!;
    expect(disclosure, "settled fold row present").toBeTruthy();
    act(() => disclosure.click());
    // the fold row's compact treatment: size-2.5 wrapper + faded idle ring
    // (idle renders the ring inside a wrapper span; the size classes sit on the span)
    const foldArea = container!.querySelector("[data-t3team-settled-fold]")!;
    const foldedIcon = foldArea.querySelector(".size-2\\.5");
    expect(foldedIcon, "folded idle row carries the compact icon wrapper").toBeTruthy();
    expect(foldedIcon!.className).toContain("text-muted-foreground/40");
    expect(foldedIcon!.querySelector("svg circle"), "idle keeps the ring glyph").toBeTruthy();
    expect(container!.querySelector(".size-1\\.5")).toBeNull();
  });

  it("completed/error sub-runs that have NOT settled stay visible with their glyphs; settled terminal ones fold with size-2.5 glyphs", () => {
    render([
      node(createThread({ id: "done-1", status: "completed" })),
      node(createThread({ id: "err-1", status: "error" })),
      node(createThread({ id: "set-done", status: "completed", settled: true })),
      node(createThread({ id: "set-err", status: "error", settled: true })),
    ]);
    // Fresh terminal children: visible rows, full-size glyphs — NO fold for them
    const allSvgs = () => Array.from(container!.querySelectorAll("button svg")) as SVGSVGElement[];
    const alert = (svgs: SVGSVGElement[]) =>
      svgs.find((svg) => svg.querySelector("circle") && svg.querySelector("line"))!;
    const check = (svgs: SVGSVGElement[]) =>
      svgs.find((svg) => svg.querySelector("circle") && !svg.querySelector("line"))!;
    expect(check(allSvgs()), "visible completed child carries the check").toBeTruthy();
    expect(alert(allSvgs()), "visible error child carries the alert").toBeTruthy();
    // The two actually-settled threads fold together
    expect(container!.textContent).toContain("Settled (2)");
    const disclosure = Array.from(container!.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Settled (2)"),
    )!;
    act(() => disclosure.click());
    // Inside the fold only: compact size-2.5 glyphs, both states
    // (completed/error render the class ON the svg; the fold's chevron is size-3, so the
    // selector picks exactly the two status glyphs)
    const foldArea = container!.querySelector("[data-t3team-settled-fold]")!;
    const foldSvgs = Array.from(foldArea.querySelectorAll("svg.size-2\\.5")) as SVGSVGElement[];
    expect(foldSvgs.length).toBe(2);
    expect(alert(foldSvgs)!.className.baseVal).toContain("size-2.5");
    expect(alert(foldSvgs)!.className.baseVal).toContain("text-destructive");
    expect(check(foldSvgs)!.className.baseVal).toContain("size-2.5");
    expect(check(foldSvgs)!.className.baseVal).toContain("text-success");
    expect(container!.querySelector(".size-1\\.5")).toBeNull();
  });
});

describe("T3TeamAgentsPanelSubRunTree live status text (GHE #40 seam)", () => {
  const statusText = () => container!.querySelector("button .font-mono")?.textContent ?? "";

  it("a running sub-run with an LLM label shows the label (shared resolution, flag on)", () => {
    render([
      node(
        createThread({
          status: "running",
          activityLabel: "Editing the router",
        }),
      ),
    ]);
    expect(statusText()).toBe("Editing the router");
  });

  it("a running sub-run shows the stable label when the flag drops the LLM label", () => {
    settingsState.activityLabelsEnabled = false;
    render([
      node(
        createThread({
          status: "running",
          activityLabel: "Editing the router",
        }),
      ),
    ]);
    expect(statusText()).toBe("Running");
    settingsState.activityLabelsEnabled = true;
  });

  it("a running sub-run between LLM labels shows the child-status summary, not bare Running", () => {
    render([node(createThread({ status: "running", childStatus: "Ran the web test suite" }))]);
    expect(statusText()).toBe("Ran the web test suite");
  });

  it("a running sub-run with neither falls back to the stable label; dots are untouched", () => {
    render([node(createThread({ status: "running" }))]);
    expect(statusText()).toBe("Running");
    // the running dot/icon language from GHE #254 is unchanged
    expect(ringSvg(), "running sub-run still carries the pulsing ring").toBeTruthy();
  });
});

describe("T3TeamAgentsPanelSubRunTree provider mark on finished sub-runs", () => {
  it("a settled (folded) finished Nexplore sub-run keeps the pack 'n' logo", () => {
    setProviders([
      {
        instanceId: "nexplore-default",
        driver: "nexplore",
        displayName: "Nexplore AI",
        iconDataUrl: NEXPLORE_ICON,
      },
    ]);
    render([
      node(
        createThread({
          id: "set-nx",
          title: "Settled Nexplore run",
          status: "completed",
          settled: true,
          providerInstanceId: "nexplore-default",
        }),
      ),
    ]);
    const disclosure = Array.from(container!.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Settled (1)"),
    )!;
    act(() => disclosure.click());
    const foldRow = foldRowByTitle("Settled Nexplore run");
    const logo = foldRow.querySelector("img");
    expect(logo, "folded row carries the provider logo").toBeTruthy();
    expect(logo!.getAttribute("src")).toBe(NEXPLORE_ICON);
    // The status glyph still follows the logo in the same row.
    expect(foldRow.querySelector("svg.size-2\\.5"), "folded check glyph kept").toBeTruthy();
  });

  it("a finished (unsettled) Nexplore sub-run keeps the same 'n' logo in its visible row", () => {
    setProviders([
      {
        instanceId: "nexplore-default",
        driver: "nexplore",
        displayName: "Nexplore AI",
        iconDataUrl: NEXPLORE_ICON,
      },
    ]);
    render([
      node(
        createThread({
          id: "done-nx",
          title: "Finished Nexplore run",
          status: "completed",
          providerInstanceId: "nexplore-default",
        }),
      ),
    ]);
    const row = Array.from(container!.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Finished Nexplore run"),
    )!;
    expect(row.querySelector("img")!.getAttribute("src")).toBe(NEXPLORE_ICON);
  });

  it("a settled built-in provider (no data URL) folds with its glyph, not the bot fallback", () => {
    setProviders([{ instanceId: "claudeAgent", driver: "claudeAgent", displayName: "Claude" }]);
    render([
      node(
        createThread({
          id: "set-claude",
          title: "Settled Claude run",
          status: "completed",
          settled: true,
          providerInstanceId: "claudeAgent",
        }),
      ),
    ]);
    const disclosure = Array.from(container!.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Settled (1)"),
    )!;
    act(() => disclosure.click());
    const foldRow = foldRowByTitle("Settled Claude run");
    expect(foldRow.querySelector("img")).toBeNull();
    // ProviderInstanceIcon's root span is the first child; its built-in glyph is an svg.
    const markSvg = foldRow.querySelector("span.isolate svg");
    expect(markSvg, "built-in provider glyph rendered in the fold").toBeTruthy();
    expect(markSvg!.getAttribute("class")).toContain("size-2.5");
  });
});
