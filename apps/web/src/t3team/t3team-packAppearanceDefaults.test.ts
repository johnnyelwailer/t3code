import { describe, expect, it } from "vite-plus/test";

import {
  resolveT3TeamAppearanceDefaults,
  t3teamAppearanceDefaultsMarker,
} from "./t3team-packAppearanceDefaults";

const marker = t3teamAppearanceDefaultsMarker({
  themeId: "nexplore",
  defaults: { sidebarLens: "work", glassOpacity: 90 },
});

describe("resolveT3TeamAppearanceDefaults", () => {
  it("maps the work lens onto upstream's beta flag and passes glass through", () => {
    const decision = resolveT3TeamAppearanceDefaults({
      defaults: { sidebarLens: "work", glassOpacity: 90 },
      marker,
      appliedMarker: null,
    });
    expect(decision.patch).toEqual({ sidebarV2Enabled: true, glassOpacity: 90 });
    expect(decision.appliedMarker).toBe(marker);
  });

  it("maps the code lens to the flag being off", () => {
    const decision = resolveT3TeamAppearanceDefaults({
      defaults: { sidebarLens: "code" },
      marker: "x",
      appliedMarker: null,
    });
    expect(decision.patch).toEqual({ sidebarV2Enabled: false });
  });

  // The whole point: a user who turns glass down or switches the lens back must not be overridden
  // on the next load.
  it("does nothing once the same defaults were applied", () => {
    expect(
      resolveT3TeamAppearanceDefaults({
        defaults: { sidebarLens: "work", glassOpacity: 90 },
        marker,
        appliedMarker: marker,
      }),
    ).toEqual({});
  });

  it("applies again when the declared defaults change", () => {
    const next = t3teamAppearanceDefaultsMarker({
      themeId: "nexplore",
      defaults: { sidebarLens: "work", glassOpacity: 70 },
    });
    expect(next).not.toBe(marker);
    const decision = resolveT3TeamAppearanceDefaults({
      defaults: { sidebarLens: "work", glassOpacity: 70 },
      marker: next,
      appliedMarker: marker,
    });
    expect(decision.patch).toEqual({ sidebarV2Enabled: true, glassOpacity: 70 });
  });

  it("does nothing when the theme declares no defaults", () => {
    expect(
      resolveT3TeamAppearanceDefaults({ defaults: undefined, marker, appliedMarker: null }),
    ).toEqual({});
  });

  // An empty block is "handled" — otherwise it would re-decide on every mount forever.
  it("records the marker but writes no patch for an empty defaults block", () => {
    const decision = resolveT3TeamAppearanceDefaults({
      defaults: {},
      marker: "empty",
      appliedMarker: null,
    });
    expect(decision.patch).toBeUndefined();
    expect(decision.appliedMarker).toBe("empty");
  });

  it("distinguishes themes with identical values", () => {
    expect(
      t3teamAppearanceDefaultsMarker({ themeId: "a", defaults: { sidebarLens: "work" } }),
    ).not.toBe(t3teamAppearanceDefaultsMarker({ themeId: "b", defaults: { sidebarLens: "work" } }));
  });
});
