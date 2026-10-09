/**
 * Per-project recipe-trigger settings (S5b): a small JSON file under the project's state dir
 * (`.t3team/recipe-triggers.json` — the same dir that already owns `recipes/` and `runs.json`)
 * that OVERRIDES a trigger's author defaults, one entry per `recipeId:triggerId`:
 *
 * ```json
 * { "version": 1, "triggers": { "my-review-triage:viewer-cr": { "enabled": true, "overrides": { "maxConcurrent": 2 } } } }
 * ```
 *
 * Absent file = all author defaults. A corrupt file is READ as "all defaults" (a settings file
 * must never take the trigger runner down), but WRITES always replace it with a well-formed doc.
 * The trigger runner only READS this file here; writing is the settings UI's job (S5 §settings).
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import type { RecipeTriggerSpec } from "@t3team/sdk";

import {
  RECIPE_TRIGGER_DEFAULT_SETTINGS,
  type RecipeTriggerEffectiveSettings,
} from "./t3team-recipeTriggerRunnerCore.ts";
import { writeFileStringAtomically } from "./atomicWrite.ts";
import {
  parseRecipeTriggerSettingsJson,
  stringifyRecipeTriggerSettingsJson,
} from "./t3team-recipeTriggerSettingsJson.ts";

/** One entry of the settings doc, keyed `${recipeId}:${triggerId}`. A type alias (not an
 * interface) so it stays assignable to plain `Record` shapes the trigger engine consumes. */
export type RecipeTriggerSetting = {
  /** Host toggle; absent = the recipe's `defaultEnabled`. */
  readonly enabled?: boolean;
  /** Host-side limit overrides; each absent field keeps the recipe's value (or its default). */
  readonly overrides?: {
    readonly debounceMs?: number;
    readonly minIntervalMs?: number;
    readonly maxConcurrent?: number;
    readonly dailyCap?: number | null;
  };
};

export interface RecipeTriggerSettingsDoc {
  readonly version: 1;
  readonly triggers: Readonly<Record<string, RecipeTriggerSetting>>;
}

export const RECIPE_TRIGGER_SETTINGS_FILE = "recipe-triggers.json";

export const recipeTriggerSettingsPath = (input: {
  readonly workspaceRoot: string;
  readonly pathService: {
    readonly join: (...parts: string[]) => string;
  };
}): string =>
  input.pathService.join(input.workspaceRoot, PROJECT_STATE_DIR, RECIPE_TRIGGER_SETTINGS_FILE);

/** Read the doc; absent or unreadable/corrupt → the empty doc (never a failure). */
export const readRecipeTriggerSettings = Effect.fn("readRecipeTriggerSettings")(function* (input: {
  readonly workspaceRoot: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const file = recipeTriggerSettingsPath({ workspaceRoot: input.workspaceRoot, pathService });
  const readResult = yield* fileSystem.readFileString(file).pipe(Effect.option);
  if (Option.isNone(readResult)) return {} as Record<string, RecipeTriggerSetting>;
  let parsed: unknown;
  try {
    parsed = parseRecipeTriggerSettingsJson(readResult.value);
  } catch {
    return {} as Record<string, RecipeTriggerSetting>;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as RecipeTriggerSettingsDoc).version !== 1 ||
    typeof (parsed as RecipeTriggerSettingsDoc).triggers !== "object"
  ) {
    return {} as Record<string, RecipeTriggerSetting>;
  }
  return (parsed as RecipeTriggerSettingsDoc).triggers;
});

/** Merge one trigger's author defaults with its stored overrides (the settings UI calls this). */
export function effectiveRecipeTriggerSettings(
  trigger: RecipeTriggerSpec,
  stored: RecipeTriggerSetting | undefined,
): RecipeTriggerEffectiveSettings & { readonly enabled: boolean } {
  const overrides = stored?.overrides ?? {};
  return {
    // Fail closed: a missing author default must never read as "on" (no surprise headless run).
    enabled: stored?.enabled ?? trigger.defaultEnabled ?? false,
    debounceMs:
      overrides.debounceMs ?? trigger.debounceMs ?? RECIPE_TRIGGER_DEFAULT_SETTINGS.debounceMs,
    minIntervalMs:
      overrides.minIntervalMs ??
      trigger.minIntervalMs ??
      RECIPE_TRIGGER_DEFAULT_SETTINGS.minIntervalMs,
    maxConcurrent:
      overrides.maxConcurrent ??
      trigger.maxConcurrent ??
      RECIPE_TRIGGER_DEFAULT_SETTINGS.maxConcurrent,
    dailyCap:
      overrides.dailyCap !== undefined
        ? overrides.dailyCap
        : trigger.dailyCap !== undefined
          ? trigger.dailyCap
          : RECIPE_TRIGGER_DEFAULT_SETTINGS.dailyCap,
  };
}

/** Write one entry (read → merge → atomic replace). Missing state dir is created. */
export const writeRecipeTriggerSetting = Effect.fn("writeRecipeTriggerSetting")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly setting: RecipeTriggerSetting;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const file = recipeTriggerSettingsPath({ workspaceRoot: input.workspaceRoot, pathService });
  const current = yield* readRecipeTriggerSettings({ workspaceRoot: input.workspaceRoot });
  const doc: RecipeTriggerSettingsDoc = {
    version: 1,
    triggers: {
      ...current,
      [`${input.recipeId}:${input.triggerId}`]: input.setting,
    },
  };
  // The helper resolves symlinks, creates the parent dir and writes atomically.
  yield* writeFileStringAtomically({
    filePath: file,
    contents: `${stringifyRecipeTriggerSettingsJson(doc)}\n`,
  });
  return doc;
});
