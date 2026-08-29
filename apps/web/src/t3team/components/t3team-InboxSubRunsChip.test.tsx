// @vitest-environment jsdom
/**
 * GHE sidebar-row refine — the sub-runs chip on the sidebar thread row counts
 * ACTIVE sub-runs only. Settled/folded children belong to the #304 "Settled
 * (N)" fold, not the chip: a parent whose children are all settled is idle
 * and must render NO chip (no stale total, no empty ring, no "0", no dot).
 *
 * Seeds through the production chain: `buildChildThreadRelations` (the
 * t3team-childThreadRelationsCore count source) → the
 * `t3team-sidebarThreadDataStore` mirror the chip actually reads.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { InboxSubRunsChip } from "./t3team-InboxSlots";
import { useT3TeamSidebarThreadDataStore } from "~/t3team/t3team-sidebarThreadDataStore";
import { buildChildThreadRelations } from "~/t3team/hooks/t3team-childThreadRelationsCore";
import type { ProjectThread } from "~/t3team/t3team-types";

function makeThread(
  id: string,
  status: ProjectThread["status"],
  parentThreadId?: string,
): ProjectThread {
  return {
    id,
    projectId: "project-1",
    ...(parentThreadId !== undefined ? { parentThreadId } : {}),
    title: `thread ${id}`,
    messageCount: 1,
    lastMessageAt: "2026-08-29T12:00:00.000Z",
    createdAt: "2026-08-29T11:00:00.000Z",
    status,
  };
}

function seedFromThreads(children: ReadonlyArray<ProjectThread>): void {
  // The tree builder only classifies a thread as a child when its parent is
  // IN THE SAME INPUT SET, so the parent itself must be seeded too.
  const relations = buildChildThreadRelations([makeThread("parent", "running"), ...children]);
  useT3TeamSidebarThreadDataStore
    .getState()
    .setSubRunCountsByParentId(relations.subRunCountsByParentId);
}

function clearStore(): void {
  useT3TeamSidebarThreadDataStore.getState().setSubRunCountsByParentId(new Map());
}

let root: Root | null = null;

function renderChip(threadId: string): { container: HTMLElement; chip: HTMLElement | null } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  act(() => {
    root = createRoot(container);
  });
  act(() => {
    root!.render(<InboxSubRunsChip threadId={threadId} />);
  });
  return { container, chip: container.querySelector("[data-t3team-sub-runs-chip]") };
}

beforeEach(() => {
  document.body.innerHTML = "";
  clearStore();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  clearStore();
});

describe("InboxSubRunsChip — active-only count (sidebar row refine)", () => {
  it("3 active + 5 settled → shows the ACTIVE count '3' (not the total 8)", () => {
    seedFromThreads([
      ...Array.from({ length: 3 }, (_, i) => makeThread(`active-${i}`, "running", "parent")),
      ...Array.from({ length: 5 }, (_, i) => makeThread(`settled-${i}`, "idle", "parent")),
    ]);
    const { chip } = renderChip("parent");
    expect(chip, "chip renders for a parent with active children").not.toBeNull();
    expect(chip!.textContent).toContain("3");
    expect(chip!.textContent).not.toContain("8");
    const label = chip!.getAttribute("aria-label") ?? "";
    expect(label).toContain("3 active sub-runs");
    expect(label).toContain("5 settled");
  });

  it("a completed child is settled, not active", () => {
    seedFromThreads([
      makeThread("active-1", "running", "parent"),
      makeThread("settled-1", "completed", "parent"),
    ]);
    const { chip } = renderChip("parent");
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain("1");
  });

  it("settled-only parent (0 active + 189 settled) → renders nothing at all", () => {
    seedFromThreads([
      ...Array.from({ length: 189 }, (_, i) => makeThread(`settled-${i}`, "idle", "parent")),
    ]);
    const { chip, container } = renderChip("parent");
    expect(chip).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("unknown parent (no children recorded) → renders nothing", () => {
    seedFromThreads([]);
    const { chip } = renderChip("parent");
    expect(chip).toBeNull();
  });

  it("the active dot speaks the working-row 4-state color, never the primary accent", () => {
    seedFromThreads([makeThread("active-1", "running", "parent")]);
    const { chip } = renderChip("parent");
    expect(chip).not.toBeNull();
    const dot = chip!.querySelector("span[aria-hidden]");
    expect(dot).not.toBeNull();
    const classes = dot!.className;
    // sky = "in motion" (same hue as the Working pill), not bg-primary.
    expect(classes).toContain("bg-sky-500");
    expect(classes).not.toContain("bg-primary");
  });
});
