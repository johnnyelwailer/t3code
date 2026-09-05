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

function alertSvg(): SVGSVGElement | null {
  // CircleAlertIcon = bare circle + exclamation <line>; CircleCheckIcon is
  // circle + check <path> only, so the line is the discriminator
  const svgs = Array.from(container!.querySelectorAll("button svg")) as SVGSVGElement[];
  return svgs.find((svg) => svg.querySelector("circle") && svg.querySelector("line")) ?? null;
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

  it("a non-running sub-run folds into the 'Settled (N)' row; expanded, idle keeps the ring faded + static", () => {
    render([node(createThread({ id: "idle-1", status: "idle" }))]);
    // GHE #304: non-running sub-runs collapse into the dim "Settled (1)" fold row — open it
    const disclosure = Array.from(container!.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Settled (1)"),
    )!;
    expect(disclosure, "settled fold row present").toBeTruthy();
    act(() => disclosure.click());
    const svg = ringSvg();
    expect(svg, "idle keeps the dashed ring icon").toBeTruthy();
    expect(svg!.className.baseVal).toContain("size-3");
    expect(svg!.className.baseVal).not.toContain("t3team-icon-pulse");
    // the fold row's compact treatment: size-2.5 wrapper + faded idle ring
    const wrapper = svg!.parentElement;
    expect(wrapper!.className).toContain("size-2.5");
    expect(wrapper!.className).toContain("text-muted-foreground/40");
    expect(container!.querySelector(".size-1\\.5")).toBeNull();
  });

  it("completed/error sub-runs fold; expanded, the check mark and alert icon carry the fold's size-2.5 glyphs", () => {
    render([
      node(createThread({ id: "done-1", status: "completed" })),
      node(createThread({ id: "err-1", status: "error" })),
    ]);
    // Both are terminal → hidden behind the fold until expanded
    expect(container!.textContent).toContain("Settled (2)");
    const disclosure = Array.from(container!.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Settled (2)"),
    )!;
    act(() => disclosure.click());
    expect(ringSvg(), "settled rows carry no ring").toBeNull();
    const alert = alertSvg();
    expect(alert, "CircleAlertIcon svg present").toBeTruthy();
    expect(alert!.className.baseVal).toContain("size-2.5");
    expect(alert!.className.baseVal).toContain("text-destructive");
    const check = (Array.from(container!.querySelectorAll("button svg")) as SVGSVGElement[]).find(
      (svg) => svg.querySelector("circle") && !svg.querySelector("line"),
    );
    expect(check, "CircleCheckIcon svg present").toBeTruthy();
    expect(check!.className.baseVal).toContain("size-2.5");
    expect(check!.className.baseVal).toContain("text-success");
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
