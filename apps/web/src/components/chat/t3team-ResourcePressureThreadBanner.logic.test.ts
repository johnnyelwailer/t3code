import { describe, expect, it } from "vite-plus/test";

import {
  BANNER_DISMISSAL_TTL_MS,
  isResourcePressureBannerSuppressed,
} from "./t3team-ResourcePressureThreadBanner.logic";

describe("isResourcePressureBannerSuppressed", () => {
  it("is not suppressed when the banner was never dismissed", () => {
    expect(isResourcePressureBannerSuppressed(null, 0)).toBe(false);
  });

  it("is suppressed immediately after dismissal", () => {
    expect(isResourcePressureBannerSuppressed(1_000, 1_001)).toBe(true);
  });

  it("stays suppressed for the whole dismissal window", () => {
    expect(isResourcePressureBannerSuppressed(0, BANNER_DISMISSAL_TTL_MS - 1)).toBe(true);
  });

  it("re-surfaces once the dismissal window has fully passed", () => {
    expect(isResourcePressureBannerSuppressed(0, BANNER_DISMISSAL_TTL_MS)).toBe(false);
  });

  it("keeps the default window at one hour", () => {
    expect(BANNER_DISMISSAL_TTL_MS).toBe(60 * 60 * 1000);
  });
});
