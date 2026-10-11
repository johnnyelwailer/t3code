import { describe, expect, it } from "vite-plus/test";

import {
  KANBAN_ZOOM_CONFIG,
  KANBAN_ZOOM_LANE_WIDTH_REM,
  KANBAN_ZOOM_LEVELS,
  clampKanbanZoomProgress,
  isKanbanZoomLevel,
  kanbanZoomLaneMinWidthRem,
  kanbanZoomLevelToProgress,
  resolveKanbanZoomLevel,
  resolveKanbanZoomVisual,
  snapKanbanZoomProgress,
  stepKanbanZoomLevel,
} from "~/t3team/t3team-kanbanZoom";

describe("kanban zoom levels", () => {
  it("orders the levels full, compact, at-a-glance", () => {
    expect(KANBAN_ZOOM_LEVELS).toEqual(["full", "compact", "at-a-glance"]);
  });

  it("recognizes only the three zoom values", () => {
    expect(isKanbanZoomLevel("full")).toBe(true);
    expect(isKanbanZoomLevel("compact")).toBe(true);
    expect(isKanbanZoomLevel("at-a-glance")).toBe(true);
    expect(isKanbanZoomLevel("zoomed")).toBe(false);
    expect(isKanbanZoomLevel(undefined)).toBe(false);
    expect(isKanbanZoomLevel(42)).toBe(false);
  });

  it("validates persisted values, falling back to full for anything unknown", () => {
    expect(resolveKanbanZoomLevel("compact")).toBe("compact");
    expect(resolveKanbanZoomLevel("at-a-glance")).toBe("at-a-glance");
    expect(resolveKanbanZoomLevel("nope")).toBe("full");
    expect(resolveKanbanZoomLevel(null)).toBe("full");
    expect(resolveKanbanZoomLevel("bogus", "compact")).toBe("compact");
  });

  it("steps one level toward at-a-glance on 'out' and toward full on 'in', clamped", () => {
    expect(stepKanbanZoomLevel("full", "out")).toBe("compact");
    expect(stepKanbanZoomLevel("compact", "out")).toBe("at-a-glance");
    expect(stepKanbanZoomLevel("at-a-glance", "out")).toBe("at-a-glance");
    expect(stepKanbanZoomLevel("at-a-glance", "in")).toBe("compact");
    expect(stepKanbanZoomLevel("compact", "in")).toBe("full");
    expect(stepKanbanZoomLevel("full", "in")).toBe("full");
  });
});

describe("kanban zoom continuous progress", () => {
  it("maps snap levels to integer progress and clamps", () => {
    expect(kanbanZoomLevelToProgress("full")).toBe(0);
    expect(kanbanZoomLevelToProgress("compact")).toBe(1);
    expect(kanbanZoomLevelToProgress("at-a-glance")).toBe(2);
    expect(clampKanbanZoomProgress(-1)).toBe(0);
    expect(clampKanbanZoomProgress(9)).toBe(2);
  });

  it("snaps fractional progress to the nearest level", () => {
    expect(snapKanbanZoomProgress(0.4)).toBe("full");
    expect(snapKanbanZoomProgress(0.6)).toBe("compact");
    expect(snapKanbanZoomProgress(1.4)).toBe("compact");
    expect(snapKanbanZoomProgress(1.6)).toBe("at-a-glance");
  });

  it("lerps lane width between snap rem values", () => {
    expect(kanbanZoomLaneMinWidthRem(0)).toBe(KANBAN_ZOOM_LANE_WIDTH_REM[0]);
    expect(kanbanZoomLaneMinWidthRem(1)).toBe(KANBAN_ZOOM_LANE_WIDTH_REM[1]);
    expect(kanbanZoomLaneMinWidthRem(2)).toBe(KANBAN_ZOOM_LANE_WIDTH_REM[2]);
    expect(kanbanZoomLaneMinWidthRem(0.5)).toBe(
      (KANBAN_ZOOM_LANE_WIDTH_REM[0] + KANBAN_ZOOM_LANE_WIDTH_REM[1]) / 2,
    );
  });

  it("fades chips but keeps ticket key + readable titles at densest visual", () => {
    const full = resolveKanbanZoomVisual(0);
    expect(full.statusOpacity).toBe(1);
    expect(full.avatarOpacity).toBe(0);
    expect(full.titleAvatarLayout).toBe(false);

    const compact = resolveKanbanZoomVisual(1);
    expect(compact.titleFontSizeRem).toBeLessThan(full.titleFontSizeRem);
    expect(compact.titleDensity).toBeGreaterThan(0);
    expect(compact.titleDensity).toBeLessThan(1);

    const glance = resolveKanbanZoomVisual(2);
    expect(glance.keyOpacity).toBe(1);
    expect(glance.iconOpacity).toBe(1);
    expect(glance.avatarOpacity).toBe(1);
    expect(glance.titleAvatarLayout).toBe(true);
    expect(glance.titleFontSizeRem).toBeLessThan(compact.titleFontSizeRem);
    expect(glance.laneMinWidthRem).toBe(KANBAN_ZOOM_LANE_WIDTH_REM[2]);
    // Shell radius must stay clear of card inset so rounded corners don't clip.
    expect(full.shellInsetStartPx).toBeGreaterThanOrEqual(full.shellRadiusRem * 16 * 0.85);
    expect(glance.shellRadiusRem).toBeLessThan(full.shellRadiusRem);
    expect(glance.matrixCardInsetPx).toBeLessThanOrEqual(full.matrixCardInsetPx);
  });
});

describe("kanban zoom level configs", () => {
  it("full keeps the legacy board layout and every card element", () => {
    const config = KANBAN_ZOOM_CONFIG.full;
    expect(config.laneMinWidthRem).toBe(17);
    expect(config.laneHeader).toBe("full");
    expect(config.cardLayout).toBe("stack");
    expect(config.showTicketKey).toBe(true);
    expect(config.showStatusChip).toBe(true);
    expect(config.showAssigneeAvatar).toBe(false);
  });

  it("compact and at-a-glance keep lane-name headers and readable card layouts", () => {
    expect(KANBAN_ZOOM_CONFIG.compact.laneHeader).toBe("compact");
    expect(KANBAN_ZOOM_CONFIG.compact.showAssigneeAvatar).toBe(true);
    expect(KANBAN_ZOOM_CONFIG["at-a-glance"].laneHeader).toBe("compact");
    expect(KANBAN_ZOOM_CONFIG["at-a-glance"].cardLayout).toBe("title-avatar");
    expect(KANBAN_ZOOM_CONFIG["at-a-glance"].showTicketKey).toBe(true);
  });
});
