/**
 * Which built-in sources a recipe trigger may listen on, and the params the host binds them with
 * (S5b). A trigger never chooses its own params: the project is the host's, and a project-scope
 * source's `query` comes from the per-project setting, else the recipe author's `scope`.
 */
import { findFeatureFlag, resolveFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import type { RecipeTriggerSpec } from "@t3team/sdk";

import type { RecipeTriggerSetting } from "./t3team-recipeTriggerSettings.ts";

type ParamsFor = (projectId: string, query: string | undefined) => Record<string, unknown>;

const projectScope: ParamsFor = (projectId, query) =>
  query === undefined ? { projectId } : { projectId, query };

const TRIGGER_SOURCE_PARAMS: Readonly<Record<string, ParamsFor>> = {
  "scm.viewer.change-requests": (projectId) => ({ projectId }),
  "scm.project.items": projectScope,
  "work-item.project-updates": projectScope,
};

/** The params the host binds this trigger's source with, or undefined when it cannot start it. */
export function triggerSourceParams(
  trigger: RecipeTriggerSpec,
  projectId: string,
  stored: RecipeTriggerSetting | undefined,
): Record<string, unknown> | undefined {
  const query = (stored?.scope?.query ?? trigger.scope?.query)?.trim();
  return TRIGGER_SOURCE_PARAMS[trigger.source.name]?.(projectId, query || undefined);
}

/** A trigger gated by a feature flag runs only while the flag is on; an unknown flag is off. */
export function recipeTriggerFlagAllows(trigger: RecipeTriggerSpec): boolean {
  if (trigger.featureFlag === undefined) return true;
  return findFeatureFlag(trigger.featureFlag) !== undefined
    ? resolveFeatureFlag(trigger.featureFlag)?.enabled === true
    : false;
}

/** Why a declared trigger is not running: the host cannot start its source, it is switched off,
 * its feature flag is off, or its action has no workflow to launch. */
export type InactiveRecipeTriggerReason =
  | "unsupported-source"
  | "disabled"
  | "feature-flag-off"
  | "no-workflow";

export function inactiveReason(input: {
  readonly params: Record<string, unknown> | undefined;
  readonly effective: { readonly enabled: boolean };
  readonly trigger: RecipeTriggerSpec;
  readonly workflowPath: string | undefined;
}): InactiveRecipeTriggerReason | null {
  if (input.params === undefined) return "unsupported-source";
  if (!input.effective.enabled) return "disabled";
  if (!recipeTriggerFlagAllows(input.trigger)) return "feature-flag-off";
  if (input.workflowPath === undefined) return "no-workflow";
  return null;
}

export function resolveRecipeTriggerActionWorkflowPath(
  entry: {
    readonly workflowPath?: string | undefined;
    readonly actions?:
      | ReadonlyArray<{ readonly name: string; readonly workflowPath?: string | undefined }>
      | undefined;
  },
  action: string | undefined,
): string | undefined {
  return action === undefined
    ? entry.workflowPath
    : entry.actions?.find((candidate) => candidate.name === action)?.workflowPath;
}
