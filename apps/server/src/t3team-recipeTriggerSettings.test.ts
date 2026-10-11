/**
 * Host-side trigger-settings merge (S5b): author defaults on the recipe, per-project overrides
 * from `.t3team/recipe-triggers.json`, and the spec's documented defaults in between.
 */
import { describe, expect, it } from "@effect/vitest";

import {
  effectiveRecipeTriggerSettings,
  RECIPE_TRIGGER_SETTINGS_FILE,
  recipeTriggerSettingsPath,
} from "./t3team-recipeTriggerSettings.ts";
import { RECIPE_TRIGGER_DEFAULT_SETTINGS } from "./t3team-recipeTriggerRunnerCore.ts";
import type { RecipeTriggerSpec } from "@t3team/sdk";

const trigger = {
  id: "viewer-cr",
  source: { kind: "signalSource", name: "scm.viewer.change-requests", emits: [] },
  signal: { kind: "signal", name: "scm.viewer.changeRequest.updated", schema: undefined },
  select: (payload: unknown) => payload as Record<string, unknown>,
  key: () => "repo#1",
  debounceMs: 30_000,
  minIntervalMs: 60_000,
  maxConcurrent: 2,
  dailyCap: 48,
  defaultEnabled: true,
} as unknown as RecipeTriggerSpec;

describe("effectiveRecipeTriggerSettings", () => {
  it("uses the recipe's own values when no setting is stored", () => {
    expect(effectiveRecipeTriggerSettings(trigger, undefined)).toEqual({
      enabled: true,
      debounceMs: 30_000,
      minIntervalMs: 60_000,
      maxConcurrent: 2,
      dailyCap: 48,
    });
  });

  it("applies the host toggle without touching the recipe's limits", () => {
    expect(effectiveRecipeTriggerSettings(trigger, { enabled: false })).toMatchObject({
      enabled: false,
      maxConcurrent: 2,
      dailyCap: 48,
    });
  });

  it("lets stored overrides win per field, keeping the rest", () => {
    expect(
      effectiveRecipeTriggerSettings(trigger, {
        enabled: true,
        overrides: { maxConcurrent: 5 },
      }),
    ).toEqual({
      enabled: true,
      debounceMs: 30_000,
      minIntervalMs: 60_000,
      maxConcurrent: 5,
      dailyCap: 48,
    });
  });

  it("lets a stored dailyCap: null clear the recipe's cap", () => {
    expect(
      effectiveRecipeTriggerSettings(trigger, { overrides: { dailyCap: null } }),
    ).toMatchObject({ dailyCap: null });
  });

  it("falls back to the spec defaults when the recipe is silent", () => {
    const bare = { ...trigger } as RecipeTriggerSpec;
    delete (bare as { debounceMs?: number }).debounceMs;
    delete (bare as { minIntervalMs?: number }).minIntervalMs;
    delete (bare as { maxConcurrent?: number }).maxConcurrent;
    delete (bare as { dailyCap?: number | null }).dailyCap;
    delete (bare as { defaultEnabled?: boolean }).defaultEnabled;
    expect(effectiveRecipeTriggerSettings(bare, undefined)).toEqual({
      enabled: false,
      ...RECIPE_TRIGGER_DEFAULT_SETTINGS,
    });
  });

  it("puts the settings file under the project state dir", () => {
    expect(
      recipeTriggerSettingsPath({
        workspaceRoot: "/repo",
        pathService: { join: (...parts: string[]) => parts.join("/") },
      }),
    ).toMatch(/\/(\.t3team|\.nexi)\/recipe-triggers\.json$/);
    expect(RECIPE_TRIGGER_SETTINGS_FILE).toBe("recipe-triggers.json");
  });
});
