// @vitest-environment jsdom
/**
 * GHE sidebar-row refine — the sub-runs chip on the sidebar thread row.
 * Three states, one handle:
 *   1. running > 0            → the ACTIVE count chip ("3"); settled/terminal
 *      children belong to the #304 "Settled (N)" fold, not the count.
 *   2. running = 0, total > 0 → a MUTED "Settled N" chip — the parent still has
 *      a visible handle to open AND collapse its sub-runs section (the #304
 *      fold row lives inside that section; without the chip, a section
 *      expanded back when children ran would sit under the row forever).
 *   3. total = 0 / unknown    → renders NO chip (no stale total, no empty
 *      ring, no "0", no dot).
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
import { useExpandedSubRunsStore } from "~/t3team/hooks/t3team-useExpandedSubRuns";
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

function click(element: Element): void {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

beforeEach(() => {
  document.body.innerHTML = "";
  clearStore();
  useExpandedSubRunsStore.setState({ expandedParentIds: new Set() });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  clearStore();
  useExpandedSubRunsStore.setState({ expandedParentIds: new Set() });
});

describe("InboxSubRunsChip — 3-state, one handle", () => {
  it("state 1: 3 active + 5 settled → shows the ACTIVE count '3' (not the total 8)", () => {
    seedFromThreads([
      ...Array.from({ length: 3 }, (_, i) => makeThread(`active-${i}`, "running", "parent")),
      ...Array.from({ length: 5 }, (_, i) => makeThread(`settled-${i}`, "idle", "parent")),
    ]);
    const { chip } = renderChip("parent");
    expect(chip, "chip renders for a parent with active children").not.toBeNull();
    expect(chip!.textContent).toContain("3");
    expect(chip!.textContent).not.toContain("8");
    expect(chip!.getAttribute("data-t3team-sub-runs-chip-state")).toBe("active");
    const label = chip!.getAttribute("aria-label") ?? "";
    expect(label).toContain("3 active sub-runs");
    expect(label).toContain("5 settled");
  });

  it("state 1: a completed child is settled, not active", () => {
    seedFromThreads([
      makeThread("active-1", "running", "parent"),
      makeThread("settled-1", "completed", "parent"),
    ]);
    const { chip } = renderChip("parent");
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain("1");
    expect(chip!.getAttribute("data-t3team-sub-runs-chip-state")).toBe("active");
  });

  it("state 1: the active dot speaks the working-row 4-state color, never the primary accent", () => {
    seedFromThreads([makeThread("active-1", "running", "parent")]);
    const { chip } = renderChip("parent");
    expect(chip).not.toBeNull();
    const dot = chip!.querySelector("span[aria-hidden]");
    expect(dot).not.toBeNull();
    const classes = dot!.className;
    // The active dot paints through the shared porcelain-orb module —
    // `working` is the working-row's 4-state in-motion color (see
    // t3team-statusOrb.css), not the theme's primary accent.
    expect(classes).toContain("t3team-orb");
    expect(dot!.getAttribute("data-t3team-state")).toBe("working");
    expect(classes).not.toContain("bg-primary");
  });

  it("state 2: 0 active + 189 settled → muted 'Settled 189' chip (the handle back)", () => {
    seedFromThreads([
      ...Array.from({ length: 189 }, (_, i) => makeThread(`settled-${i}`, "idle", "parent")),
    ]);
    const { chip } = renderChip("parent");
    expect(chip, "settled-only parent still gets a visible handle").not.toBeNull();
    expect(chip!.textContent).toContain("Settled 189");
    expect(chip!.getAttribute("data-t3team-sub-runs-chip-state")).toBe("settled");
    const label = chip!.getAttribute("aria-label") ?? "";
    expect(label).toContain("Settled 189 sub-runs");
    // Muted: the fold row's own dim level, dimmer than the active chip's text.
    expect(chip!.className).toContain("text-sidebar-muted-foreground/60");
    expect(chip!.className).not.toContain("hover:text-sidebar-foreground");
    // No working dot: settled work is reachable, not live.
    expect(chip!.querySelector("span.rounded-full")).toBeNull();
  });

  it("state 2: singular settles read 'Settled 1 sub-run'", () => {
    seedFromThreads([makeThread("settled-1", "completed", "parent")]);
    const { chip } = renderChip("parent");
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain("Settled 1");
    expect(chip!.getAttribute("aria-label")).toContain("Settled 1 sub-run");
  });

  it("state 2: clicking the chip toggles the section (expand, then collapse again)", () => {
    seedFromThreads([
      ...Array.from({ length: 189 }, (_, i) => makeThread(`settled-${i}`, "idle", "parent")),
    ]);
    const { chip } = renderChip("parent");
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute("aria-expanded")).toBe("false");
    const store = () => useExpandedSubRunsStore.getState().expandedParentIds;
    expect(store().has("parent")).toBe(false);
    click(chip!); // opens the sub-runs section (where the #304 fold row lives)
    expect(store().has("parent")).toBe(true);
    expect(chip!.getAttribute("aria-expanded")).toBe("true");
    click(chip!); // collapses it — the fold row disappears under the row
    expect(store().has("parent")).toBe(false);
    expect(chip!.getAttribute("aria-expanded")).toBe("false");
  });

  it("state 3: no children at all (0 active + 0 settled) → renders nothing", () => {
    seedFromThreads([]);
    const { chip, container } = renderChip("parent");
    expect(chip).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("state 3: unknown parent (no children recorded) → renders nothing", () => {
    seedFromThreads([]);
    const { chip } = renderChip("never-seen");
    expect(chip).toBeNull();
  });
});
