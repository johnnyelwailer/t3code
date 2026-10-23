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
import type { AnyRecipeRef, RecipeListEntry } from "@t3team/sdk";
import { resolveSignalSourceParams } from "@t3team/sdk";

import type { LiveTrigger } from "./t3team-recipeTriggerRunnerCore.ts";
import {
  effectiveRecipeTriggerSettings,
  type RecipeTriggerSetting,
} from "./t3team-recipeTriggerSettings.ts";
import {
  recipeTriggerFlagAllows,
  resolveRecipeTriggerActionWorkflowPath,
  triggerSourceParams,
} from "./t3team-recipeTriggerSources.ts";

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

const registrationKey = (owner: string, sourceName: string, paramsHash: string) =>
  `${owner}|${sourceName}|${paramsHash}`;

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
        const stored = settings[`${entry.id}:${trigger.id}`];
        const params = triggerSourceParams(trigger, project.projectId, stored);
        if (params === undefined) {
          input.log("trigger listens to a source the host cannot start; skipped", {
            recipe: entry.id,
            trigger: trigger.id,
            source: trigger.source.name,
          });
          continue;
        }
        const effective = effectiveRecipeTriggerSettings(trigger, stored);
        if (!effective.enabled || !recipeTriggerFlagAllows(trigger)) continue;
        const resolved = await resolveSignalSourceParams(trigger.source, params);
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
        desired.add(registrationKey(owner, trigger.source.name, resolved.paramsHash));
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
          storedSetting: stored ?? {},
          modelSelection: project.defaultModelSelection,
          allowedToolGroups: ref.allowedToolGroups,
        });
      }
    }
  }

  for (const row of current) {
    // Keyed on the instance too: a trigger whose scope changed must drop its old instance's row.
    if (desired.has(registrationKey(row.runId, row.sourceName, row.paramsHash))) continue;
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
