import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import { afterEach, assert, describe, it } from "vite-plus/test";

import {
  budgetWhenWatchdogEnabled,
  DEFAULT_TURN_INACTIVITY_TIMEOUT_MS,
} from "./t3team-turnInactivityPolicy.ts";

const noEnv = () => undefined;

describe("stalled-turn watchdog behind AGENTS_TURN_WATCHDOG", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it("arms the instance budget by default", () => {
    assert.equal(budgetWhenWatchdogEnabled(90, noEnv), 90_000);
    assert.equal(budgetWhenWatchdogEnabled(undefined, noEnv), DEFAULT_TURN_INACTIVITY_TIMEOUT_MS);
  });

  it("arms no watchdog while the flag is off, and arms again once it is back on", () => {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_TURN_WATCHDOG", false]]));
    assert.isNull(budgetWhenWatchdogEnabled(90, noEnv));

    replaceFeatureFlagPresetValues(new Map([["AGENTS_TURN_WATCHDOG", true]]));
    assert.equal(budgetWhenWatchdogEnabled(90, noEnv), 90_000);
  });

  it("follows the env override over the preset", () => {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_TURN_WATCHDOG", true]]));
    const off = (name: string) => (name === "NEXI_FF_AGENTS_TURN_WATCHDOG" ? "0" : undefined);
    assert.isNull(budgetWhenWatchdogEnabled(90, off));
  });
});
