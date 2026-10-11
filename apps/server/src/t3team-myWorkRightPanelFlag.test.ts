import { afterEach, describe, expect, it } from "vite-plus/test";

import { replaceFeatureFlagDatabaseValues } from "@t3tools/project-context/t3teamFeatureFlags";

import { isMyWorkRightPanelEnabled } from "./t3team-myWorkRightPanelFlag.ts";

describe("isMyWorkRightPanelEnabled", () => {
  afterEach(() => {
    replaceFeatureFlagDatabaseValues(new Map());
  });

  it("defaults on", () => {
    expect(isMyWorkRightPanelEnabled(() => undefined)).toBe(true);
  });

  it("honours env over the default", () => {
    expect(
      isMyWorkRightPanelEnabled((key) => (key === "NEXI_FF_MYWORK_RIGHT_PANEL" ? "0" : undefined)),
    ).toBe(false);
    expect(
      isMyWorkRightPanelEnabled((key) => (key === "NEXI_FF_MYWORK_RIGHT_PANEL" ? "1" : undefined)),
    ).toBe(true);
  });

  it("honours the DB when env is unset", () => {
    replaceFeatureFlagDatabaseValues(new Map([["MYWORK_RIGHT_PANEL", false]]));
    expect(isMyWorkRightPanelEnabled(() => undefined)).toBe(false);
  });
});
