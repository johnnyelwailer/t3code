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
import { afterEach, describe, expect, it } from "vite-plus/test";

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

  it("an idle sub-run (inside the disclosure) keeps the ring at size-3, faded + static", () => {
    render([node(createThread({ id: "idle-1", status: "idle" }))]);
    // idle threads collapse into the "1 idle · expand" disclosure — open it
    const disclosure = Array.from(container!.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("idle"),
    )!;
    expect(disclosure, "idle disclosure row present").toBeTruthy();
    act(() => disclosure.click());
    const svg = ringSvg();
    expect(svg, "idle keeps the dashed ring icon").toBeTruthy();
    expect(svg!.className.baseVal).toContain("size-3");
    expect(svg!.className.baseVal).not.toContain("t3team-icon-pulse");
    const wrapper = svg!.parentElement;
    expect(wrapper!.className).toContain("text-muted-foreground/40");
    expect(container!.querySelector(".size-1\\.5")).toBeNull();
  });

  it("a completed sub-run keeps the check mark; an errored one renders the alert icon at size-3", () => {
    render([
      node(createThread({ id: "done-1", status: "completed" })),
      node(createThread({ id: "err-1", status: "error" })),
    ]);
    expect(ringSvg(), "settled rows carry no ring").toBeNull();
    const alert = alertSvg();
    expect(alert, "CircleAlertIcon svg present").toBeTruthy();
    expect(alert!.className.baseVal).toContain("size-3");
    expect(alert!.className.baseVal).toContain("text-destructive");
    expect(container!.querySelector(".size-1\\.5")).toBeNull();
  });
});
