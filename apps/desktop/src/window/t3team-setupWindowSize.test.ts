import { describe, expect, it } from "vite-plus/test";

import {
  SETUP_WINDOW_MAX,
  SETUP_WINDOW_MIN,
  SETUP_WINDOW_PREFERRED,
  SETUP_WINDOW_WORK_AREA_MARGIN,
  readDisplayWorkArea,
  sizeSetupWindowFromScreen,
  sizeSetupWindowToWorkArea,
  type WorkArea,
} from "./t3team-setupWindowSize.ts";

function area(width: number, height: number, x = 0, y = 0): WorkArea {
  return { x, y, width, height };
}

function usable(workArea: WorkArea) {
  return {
    width: workArea.width - SETUP_WINDOW_WORK_AREA_MARGIN * 2,
    height: workArea.height - SETUP_WINDOW_WORK_AREA_MARGIN * 2,
  };
}

describe("sizeSetupWindowToWorkArea", () => {
  it("fills a small work area (minus the margin) and stays inside it, even below the preferred min", () => {
    const work = area(800, 600);
    const bounds = sizeSetupWindowToWorkArea(work);
    const room = usable(work);
    expect(bounds.width).toBe(room.width);
    expect(bounds.height).toBe(room.height);
    expect(bounds.width).toBeLessThan(SETUP_WINDOW_MIN.width);
    expect(bounds.height).toBeLessThan(SETUP_WINDOW_MIN.height);
    expect(bounds.x).toBe(SETUP_WINDOW_WORK_AREA_MARGIN);
    expect(bounds.y).toBe(SETUP_WINDOW_WORK_AREA_MARGIN);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(work.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(work.height);
  });

  it("uses the preferred size on a default laptop work area that can hold it", () => {
    // 1440×900 is a common laptop work area; preferred 1280×900 fits in width,
    // but the height is clamped to the usable 852.
    const work = area(1440, 900);
    const bounds = sizeSetupWindowToWorkArea(work);
    const room = usable(work);
    expect(bounds.width).toBe(SETUP_WINDOW_PREFERRED.width);
    expect(bounds.height).toBe(Math.min(SETUP_WINDOW_PREFERRED.height, room.height));
    expect(bounds.width).toBeGreaterThanOrEqual(SETUP_WINDOW_MIN.width);
    expect(bounds.x).toBe(Math.round((work.width - bounds.width) / 2));
    expect(bounds.y).toBe(Math.round((work.height - bounds.height) / 2));
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(work.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(work.height);
  });

  it("keeps the preferred size on a large work area and does not grow to the max or fill the screen", () => {
    const work = area(2560, 1440, 100, 50);
    const bounds = sizeSetupWindowToWorkArea(work);
    expect(bounds).toEqual({
      width: SETUP_WINDOW_PREFERRED.width,
      height: SETUP_WINDOW_PREFERRED.height,
      x: 100 + Math.round((2560 - SETUP_WINDOW_PREFERRED.width) / 2),
      y: 50 + Math.round((1440 - SETUP_WINDOW_PREFERRED.height) / 2),
    });
    expect(bounds.width).toBeLessThan(SETUP_WINDOW_MAX.width);
    expect(bounds.height).toBeLessThan(SETUP_WINDOW_MAX.height);
  });

  it("clamps a mid-size work area to the usable region and honors the min when it still fits", () => {
    const work = area(1100, 780);
    const bounds = sizeSetupWindowToWorkArea(work);
    const room = usable(work);
    expect(bounds.width).toBe(room.width);
    expect(bounds.height).toBe(room.height);
    expect(bounds.width).toBeGreaterThanOrEqual(SETUP_WINDOW_MIN.width);
    expect(bounds.height).toBeGreaterThanOrEqual(SETUP_WINDOW_MIN.height);
  });
});

describe("readDisplayWorkArea / sizeSetupWindowFromScreen", () => {
  it("prefers getDisplayMatching on the cursor, then the matching display's workArea", () => {
    const work = area(1920, 1040, 0, 40);
    const screen = {
      getCursorScreenPoint: () => ({ x: 400, y: 300 }),
      getDisplayMatching: (rect: WorkArea) => {
        expect(rect).toEqual({ x: 400, y: 300, width: 1, height: 1 });
        return { workArea: work, bounds: area(1920, 1080) };
      },
      getPrimaryDisplay: () => {
        throw new Error("must not fall through");
      },
    };
    expect(readDisplayWorkArea(screen)).toEqual(work);
    expect(sizeSetupWindowFromScreen(screen)).toEqual(sizeSetupWindowToWorkArea(work));
  });

  it("returns null when the screen API is missing or throws, so the caller keeps its default", () => {
    expect(readDisplayWorkArea(null)).toBeNull();
    expect(readDisplayWorkArea({})).toBeNull();
    expect(sizeSetupWindowFromScreen(undefined)).toBeNull();
    expect(
      sizeSetupWindowFromScreen({
        getCursorScreenPoint: () => {
          throw new Error("no display");
        },
      }),
    ).toBeNull();
  });
});
