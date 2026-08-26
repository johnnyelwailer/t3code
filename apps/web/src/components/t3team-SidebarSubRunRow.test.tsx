// @vitest-environment jsdom
/**
 * SidebarSubRunRow — sidebar v2 thread-row redesign regression:
 * child / sub-run rows must render the SAME status treatment as parent rows —
 * the ring icon (ThreadActivityMorphIcon, sm variant) and the live status
 * summary derived by the parent's verbatim pipeline
 * (resolveActivityPillDisplay over activityState + activityLabel, gated by
 * `t3teamActivityLabelsEnabled` on the detail only). Before the fix the
 * running child row rendered a plain `size-1.5 rounded-full` dot and never
 * showed any status summary.
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
import { SidebarSubRunRow } from "./t3team-SidebarSubRunRow";

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

const childRef = { environmentId: "env-1", threadId: "child-1" } as never;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(thread: ProjectThread) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root!.render(
      <ul>
        <SidebarSubRunRow
          child={thread}
          childRef={childRef}
          isActive={false}
          onNavigate={() => {}}
          onContextMenu={() => {}}
        />
      </ul>,
    );
  });
}

function button(): HTMLButtonElement {
  expect(container!.querySelectorAll("button").length, "exactly one row button").toBe(1);
  return container!.querySelector("button")!;
}

function ringSvg(): SVGSVGElement | null {
  // the ring icon is the only status svg whose <circle> carries a
  // stroke-dasharray (lucide icons carry none); the settled CircleCheckIcon
  // is size-3 too and has a bare circle
  return (
    Array.from(container!.querySelectorAll("button svg circle"))
      .find((circle) => (circle as SVGCircleElement).style.strokeDasharray !== "")
      ?.closest("svg") ?? null
  );
}

afterEach(() => {
  settingsState.activityLabelsEnabled = true;
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe("SidebarSubRunRow status treatment", () => {
  it("a running sub-run renders the parent's dashed ring icon (sm), not the old plain dot", () => {
    render(createThread({ status: "running" }));
    const svg = ringSvg();
    expect(svg, "ring icon svg present").toBeTruthy();
    const circle = svg!.querySelector("circle");
    expect(circle, "ring circle present").toBeTruthy();
    // dashed ring = running state (identical language to ThreadActivityStatus
    // on the parent card; solid 62.83 dasharray is the done state)
    expect((circle as SVGCircleElement).style.strokeDasharray).toContain("7 3.44");
    expect(svg!.className.baseVal).toContain("size-3");
    // the old treatment: a size-1.5 rounded-full dot — must be gone
    expect(container!.querySelector("button .size-1\\.5")).toBeNull();
  });

  it("shows the live status summary the parent row shows: state word · detail (flag on)", () => {
    render(
      createThread({
        status: "running",
        activityState: "thinking",
        activityLabel: "Reading contracts",
      }),
    );
    const text = button().textContent ?? "";
    expect(text).toContain("Thinking · Reading contracts");
    // the summary shimmers, same as the parent's live label
    expect(container!.querySelector("span.t3team-label-shimmer")).not.toBeNull();
  });

  it("gates the LLM detail on activityLabelsEnabled exactly like the parent (state word stays)", () => {
    settingsState.activityLabelsEnabled = false;
    render(
      createThread({
        status: "running",
        activityState: "waiting",
        activityLabel: "Reading contracts",
      }),
    );
    const text = button().textContent ?? "";
    expect(text).toContain("Waiting");
    expect(text).not.toContain("Reading contracts");
  });

  it("falls back to the stable 'Working' label when there is no state word or detail", () => {
    render(createThread({ status: "running" }));
    const text = button().textContent ?? "";
    expect(text).toContain("Working");
  });

  it("a settled sub-run keeps the check mark and shows no live summary", () => {
    render(createThread({ status: "completed" }));
    expect(ringSvg()).toBeNull();
    // CircleCheckIcon renders a <path>; no shimmer status text
    expect(container!.querySelector("button svg path")).not.toBeNull();
    expect(container!.querySelector("span.t3team-label-shimmer")).toBeNull();
    expect(button().textContent).toContain("Sub-run thread");
  });
});
