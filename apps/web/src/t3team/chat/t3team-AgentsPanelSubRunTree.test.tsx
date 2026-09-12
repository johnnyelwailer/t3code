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
    messageCount: overrides.messageCount ?? 0,
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

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe("T3TeamAgentsPanelSubRunTree status language (GHE #254)", () => {
  it("a child with a pending question shows the amber question mark and the awaiting label", () => {
    render([node(createThread({ status: "running", pendingUserInput: true }))]);
    // The awaiting label replaces the live state word in the row text…
    expect(container!.textContent).toContain("Question awaiting answer");
    // …and the amber question-mark glyph outranks the lifecycle icon.
    const svgs = Array.from(container!.querySelectorAll("button svg")) as SVGSVGElement[];
    const questionSvg = svgs.find((svg) => svg.className.baseVal.includes("text-amber-600"));
    expect(questionSvg, "amber question-mark icon present").toBeTruthy();
    expect(questionSvg!.className.baseVal).toContain("size-3");
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

describe("T3TeamAgentsPanelSubRunTree live status text (GHE #208 seam)", () => {
  const statusText = () => container!.querySelector("button .font-mono")?.textContent ?? "";

  it("a running sub-run with an LLM label shows the label (shared resolution, flag on)", () => {
    render([
      node(
        createThread({
          status: "running",
          activityState: "writing",
          activityLabel: "Editing the router",
        }),
      ),
    ]);
    expect(statusText()).toBe("Editing the router");
  });

  it("a running sub-run with only a state word shows the word (flag off drops the label)", () => {
    settingsState.activityLabelsEnabled = false;
    render([
      node(
        createThread({
          status: "running",
          activityState: "writing",
          activityLabel: "Editing the router",
        }),
      ),
    ]);
    expect(statusText()).toBe("Writing");
    settingsState.activityLabelsEnabled = true;
  });

  it("a running sub-run with neither falls back to the stable label; dots are untouched", () => {
    render([node(createThread({ status: "running" }))]);
    expect(statusText()).toBe("Running");
    // the running dot/icon language from GHE #254 is unchanged
    expect(ringSvg(), "running sub-run still carries the pulsing ring").toBeTruthy();
  });
});
