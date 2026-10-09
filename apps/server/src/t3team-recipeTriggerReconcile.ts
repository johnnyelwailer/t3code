/**
 * Registration reconcile for recipe triggers (S5b): for every active project, read the
 * unfiltered recipe library (pack + project-local, one precedence) and
 * `.t3team/recipe-triggers.json`, compute which `trigger:<recipe>:<id>` registrations belong in
 * the durable signal store, upsert them, delete the stale ones, and return the enabled live
 * triggers the runner's drain tick acts on. Deletion is conservative: a project whose
 * enumeration FAILED this tick keeps its registrations (absence of evidence is not deletion),
 * while everything else not in the desired set is dropped, including rows of gone projects.
 */

import * as DateTime from "effect/DateTime";

import type { ModelSelection } from "@t3tools/contracts";
import type { AnyRecipeRef, RecipeListEntry, RecipeTriggerSpec } from "@t3team/sdk";
import { resolveSignalSourceParams } from "@t3team/sdk";

import type {
  LiveTrigger,
  RecipeTriggerEffectiveSettings,
  RecipeTriggerInstanceRef,
} from "./t3team-recipeTriggerRunnerCore.ts";
import {
  effectiveRecipeTriggerSettings,
  type RecipeTriggerSetting,
} from "./t3team-recipeTriggerSettings.ts";

/** The host-side source adapters a trigger may listen on: source name → params(projectId). */
export const TRIGGER_SOURCE_PARAMS: Readonly<
  Record<string, (projectId: string) => Record<string, unknown>>
> = {
  "scm.viewer.change-requests": (projectId) => ({ projectId }),
};

export interface RecipeTriggerReconcileInput {
  /** The active projects (the live layer lists them from the V2 project store). */
  readonly projects: ReadonlyArray<{
    readonly projectId: string;
    readonly workspaceRoot: string;
    readonly defaultModelSelection: ModelSelection | null;
  }>;
  /** The durable registration rows, already decoded (the signal store ports). */
  readonly store: {
    readonly upsertRegistration: (input: {
      readonly runId: string;
      readonly sourceName: string;
      readonly paramsHash: string;
      readonly params: unknown;
      readonly registeredAt: string;
    }) => Promise<void>;
    readonly deleteRegistration: (input: {
      readonly owner: string;
      readonly sourceName: string;
      readonly paramsHash: string;
    }) => Promise<void>;
    readonly listTriggerRegistrations: () => Promise<
      ReadonlyArray<{
        readonly runId: string;
        readonly sourceName: string;
        readonly paramsHash: string;
        readonly params: unknown;
      }>
    >;
  };
  /** Per-project trigger settings (`.t3team/recipe-triggers.json`), decoded to plain objects. */
  readonly readSettings: (
    workspaceRoot: string,
  ) => Promise<Readonly<Record<string, RecipeTriggerSetting>>>;
  /** The unfiltered recipe library for a project (the agent-facing enumeration). */
  readonly listRecipes: (workspaceRoot: string) => Promise<{
    readonly recipes: ReadonlyArray<RecipeListEntry>;
  }>;
  /** Import one `recipe.ts` module's default ref; rejects on a load/shape error. */
  readonly importRecipeRef: (modulePath: string) => Promise<AnyRecipeRef>;
  /** The signal reconciler to poke once the registration set changed. */
  readonly reconciler?: { readonly reconcile: () => Promise<void> } | undefined;
  readonly log: (message: string, fields?: unknown) => void;
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

export async function reconcileRecipeTriggerRegistrations(
  input: RecipeTriggerReconcileInput,
): Promise<ReadonlyArray<LiveTrigger>> {
  const current = await input.store.listTriggerRegistrations();
  const desired = new Set<string>();
  const failedProjectIds = new Set<string>();
  const next: LiveTrigger[] = [];
  for (const project of input.projects) {
    const settings = await input
      .readSettings(project.workspaceRoot)
      .catch(() => ({}) as Record<string, RecipeTriggerSetting>);
    let library: { readonly recipes: ReadonlyArray<RecipeListEntry> };
    try {
      library = await input.listRecipes(project.workspaceRoot);
    } catch {
      input.log("recipe library enumeration failed; keeping this project's trigger rows", {
        project: project.projectId,
      });
      failedProjectIds.add(project.projectId);
      continue;
    }
    for (const entry of library.recipes) {
      if (entry.authoring !== "recipe-ts") continue; // triggers live in recipe.ts modules only
      let ref: AnyRecipeRef;
      try {
        ref = await input.importRecipeRef(`${entry.recipePath}/recipe.ts`);
      } catch {
        continue; // a transient load error: keep the existing registrations, retry next tick
      }
      if (ref.kind !== "recipe" || ref.triggers === undefined) continue;
      for (const trigger of ref.triggers) {
        const owner = `trigger:${entry.id}:${trigger.id}`;
        const paramsFor = TRIGGER_SOURCE_PARAMS[trigger.source.name];
        if (paramsFor === undefined) {
          input.log("trigger listens to a source the host cannot start; skipped", {
            recipe: entry.id,
            trigger: trigger.id,
            source: trigger.source.name,
          });
          continue;
        }
        const resolved = await resolveSignalSourceParams(
          trigger.source,
          paramsFor(project.projectId),
        );
        const effective = effectiveRecipeTriggerSettings(
          trigger,
          settings[`${entry.id}:${trigger.id}`],
        );
        if (!effective.enabled) continue;
        const workflowPath = resolveRecipeTriggerActionWorkflowPath(entry, trigger.action);
        if (workflowPath === undefined) {
          input.log("trigger's action has no resolvable .workflow.ts; skipped", {
            recipe: entry.id,
            trigger: trigger.id,
            action: trigger.action,
          });
          continue;
        }
        await input.store.upsertRegistration({
          runId: owner,
          sourceName: trigger.source.name,
          paramsHash: resolved.paramsHash,
          params: resolved.params,
          registeredAt: DateTime.formatIso(DateTime.nowUnsafe()),
        });
        desired.add(owner);
        next.push({
          projectId: project.projectId,
          workspaceRoot: project.workspaceRoot,
          recipeId: entry.id,
          triggerId: trigger.id,
          action: trigger.action ?? "default",
          recipePath: entry.recipePath,
          workflowPath,
          instance: {
            sourceName: trigger.source.name,
            paramsHash: resolved.paramsHash,
            signalName: trigger.signal.name,
          },
          select: trigger.select,
          key: trigger.key,
          settings: effective,
          storedSetting: settings[`${entry.id}:${trigger.id}`] ?? {},
          modelSelection: project.defaultModelSelection,
          allowedToolGroups: ref.allowedToolGroups,
        });
      }
    }
  }

  for (const row of current) {
    if (desired.has(row.runId)) continue;
    const projectId =
      typeof row.params === "object" &&
      row.params !== null &&
      typeof (row.params as { projectId?: unknown }).projectId === "string"
        ? (row.params as { projectId: string }).projectId
        : undefined;
    // A failed enumeration keeps its project's rows: absence of evidence is not deletion.
    if (projectId !== undefined && failedProjectIds.has(projectId)) continue;
    await input.store.deleteRegistration({
      owner: row.runId,
      sourceName: row.sourceName,
      paramsHash: row.paramsHash,
    });
  }
  await input.reconciler?.reconcile().catch(() => {});
  return next;
}
