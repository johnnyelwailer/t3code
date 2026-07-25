import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildT3TeamSidecarItemMenuEntries,
  buildT3TeamSidecarSectionHeaderMenuEntries,
} from "~/t3team/t3team-sidecarSectionMenuActions";

const DECLARED_ACTION = {
  id: "apply-now",
  label: "Apply filter now",
  run: {
    kind: "tool" as const,
    toolName: "t3team.backlog.set_assignee_filter",
    input: { mode: "current-user" },
  },
};

describe("sidecar section menu entries", () => {
  it("keeps universal header actions ahead of declared actions in one ordered menu model", () => {
    const entries = buildT3TeamSidecarSectionHeaderMenuEntries({
      collapsed: false,
      canMoveUp: true,
      canMoveDown: true,
      onMoveUp: vi.fn(),
      onMoveDown: vi.fn(),
      onToggleCollapsed: vi.fn(),
      showResetSection: true,
      onResetSection: vi.fn(),
      onHideSection: vi.fn(),
      declaredActions: [DECLARED_ACTION],
      onRunDeclaredAction: vi.fn(),
    });

    expect(entries.map((entry) => (entry.kind === "action" ? entry.label : "separator"))).toEqual([
      "Move up",
      "Move down",
      "Collapse section",
      "Reset section",
      "Hide section",
      "separator",
      "Apply filter now",
    ]);
  });

  it("keeps universal item actions ahead of declared actions in one ordered menu model", () => {
    const entries = buildT3TeamSidecarItemMenuEntries({
      pinned: false,
      onPinItem: vi.fn(),
      onUnpinItem: vi.fn(),
      showCustomizeItem: true,
      onCustomizeItem: vi.fn(),
      onHideItem: vi.fn(),
      declaredActions: [DECLARED_ACTION],
      onRunDeclaredAction: vi.fn(),
    });

    expect(entries.map((entry) => (entry.kind === "action" ? entry.label : "separator"))).toEqual([
      "Pin item",
      "Customize…",
      "Hide item",
      "separator",
      "Apply filter now",
    ]);
  });

  it("shows Edit this… only for items with a project-local source path and invokes it", () => {
    const onEditItem = vi.fn();
    const entries = buildT3TeamSidecarItemMenuEntries({
      pinned: false,
      onPinItem: vi.fn(),
      onUnpinItem: vi.fn(),
      editSourcePath: "/workspace/.t3team/recipes/local/recipe.json",
      onEditItem,
      showCustomizeItem: true,
      onCustomizeItem: vi.fn(),
      onHideItem: vi.fn(),
      onRunDeclaredAction: vi.fn(),
    });

    expect(entries.map((entry) => (entry.kind === "action" ? entry.label : "separator"))).toEqual([
      "Pin item",
      "Edit this…",
      "Customize…",
      "Hide item",
    ]);
    const editEntry = entries.find((entry) => entry.kind === "action" && entry.id === "edit-item");
    expect(editEntry?.kind).toBe("action");
    if (editEntry?.kind === "action") {
      editEntry.onSelect();
    }
    expect(onEditItem).toHaveBeenCalledWith("/workspace/.t3team/recipes/local/recipe.json");
  });

  it("omits Edit this… for items that do not expose a source path", () => {
    const entries = buildT3TeamSidecarItemMenuEntries({
      pinned: false,
      onPinItem: vi.fn(),
      onUnpinItem: vi.fn(),
      onHideItem: vi.fn(),
      onRunDeclaredAction: vi.fn(),
    });

    expect(entries.some((entry) => entry.kind === "action" && entry.id === "edit-item")).toBe(
      false,
    );
  });

  it("omits reset and customize entries when there are no resettable overrides", () => {
    const headerEntries = buildT3TeamSidecarSectionHeaderMenuEntries({
      collapsed: false,
      canMoveUp: true,
      canMoveDown: true,
      onMoveUp: vi.fn(),
      onMoveDown: vi.fn(),
      onToggleCollapsed: vi.fn(),
      onHideSection: vi.fn(),
      onRunDeclaredAction: vi.fn(),
    });
    const itemEntries = buildT3TeamSidecarItemMenuEntries({
      pinned: false,
      onPinItem: vi.fn(),
      onUnpinItem: vi.fn(),
      onHideItem: vi.fn(),
      onRunDeclaredAction: vi.fn(),
    });

    expect(
      headerEntries.some((entry) => entry.kind === "action" && entry.id === "reset-section"),
    ).toBe(false);
    expect(
      itemEntries.some((entry) => entry.kind === "action" && entry.id === "customize-item"),
    ).toBe(false);
  });
});
