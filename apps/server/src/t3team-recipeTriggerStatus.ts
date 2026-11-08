/**
 * One reading of every recipe trigger's health (S5b diagnostics), per project: is it on and why
 * not, what it watches (scope), whether its source instance runs and what its last poll said
 * (auth, refused reads), where its cursor stands, the newest event and the undelivered backlog,
 * and the newest launch with its run id and last error.
 *
 * Everything but instance health is durable state, read fresh: the trigger set comes from the same
 * reconcile the runner uses, driven dry (its store ports discard writes), so the reading cannot
 * disagree with the runner about which triggers are on.
 */
import { signalInstanceKey } from "@t3team/sdk";

import type {
  TriggerLaunchRow,
  WorkflowTriggerLaunchStoreShape,
} from "./persistence/t3team-WorkflowTriggerLaunchStoreTypes.ts";
import {
  reconcileRecipeTriggerRegistrations,
  type InactiveRecipeTrigger,
  type RecipeTriggerReconcileInput,
} from "./t3team-recipeTriggerReconcile.ts";
import type { InactiveRecipeTriggerReason } from "./t3team-recipeTriggerSources.ts";
import type { SignalInstanceStatus } from "./t3team-workflowSignalReconcilerCore.ts";

export interface RecipeTriggerStatusRow {
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly sourceName: string;
  readonly state: "active" | InactiveRecipeTriggerReason;
  /** The source params the trigger is bound with: the project and its scope query. */
  readonly scope?: unknown;
  readonly instance?: {
    readonly state: SignalInstanceStatus["state"] | "not-running";
    readonly lastPollAt?: string | undefined;
    readonly lastError?: string | undefined;
  };
  readonly cursorUpdatedAt?: string | null;
  readonly lastEventAt?: string | null;
  readonly undelivered?: number;
  readonly lastLaunch?: Pick<
    TriggerLaunchRow,
    "status" | "attempts" | "lastError" | "claimedAt" | "launchedAt"
  > & { readonly runId: string };
}

export interface RecipeTriggerStatusPorts {
  readonly projects: RecipeTriggerReconcileInput["projects"];
  readonly readSettings: RecipeTriggerReconcileInput["readSettings"];
  readonly listRecipes: RecipeTriggerReconcileInput["listRecipes"];
  readonly importRecipeRef: RecipeTriggerReconcileInput["importRecipeRef"];
  readonly cursorUpdatedAt: (instanceKey: string) => Promise<string | null>;
  readonly inboxSummary: (
    input: Parameters<WorkflowTriggerLaunchStoreShape["inboxSummary"]>[0],
  ) => Promise<{ readonly lastEventAt: string | null; readonly undelivered: number }>;
  readonly lastLaunch: (input: {
    readonly projectId: string;
    readonly recipeId: string;
    readonly triggerId: string;
  }) => Promise<TriggerLaunchRow | undefined>;
  /** The reconciler's live instances; empty when this process runs none. */
  readonly instances: () => ReadonlyArray<SignalInstanceStatus>;
}

const discard = async () => {};

export async function readRecipeTriggerStatus(
  ports: RecipeTriggerStatusPorts,
): Promise<ReadonlyArray<RecipeTriggerStatusRow>> {
  const inactive: InactiveRecipeTrigger[] = [];
  const live = await reconcileRecipeTriggerRegistrations({
    projects: ports.projects,
    store: {
      upsertRegistration: discard,
      deleteRegistration: discard,
      listTriggerRegistrations: async () => [],
    },
    readSettings: ports.readSettings,
    listRecipes: ports.listRecipes,
    importRecipeRef: ports.importRecipeRef,
    log: () => {},
    onInactive: (trigger) => void inactive.push(trigger),
  });
  const instances = new Map(ports.instances().map((status) => [status.instanceKey, status]));

  const active = await Promise.all(
    live.map(async (trigger): Promise<RecipeTriggerStatusRow> => {
      const instanceKey = signalInstanceKey(
        trigger.instance.sourceName,
        trigger.instance.paramsHash,
      );
      const instance = instances.get(instanceKey);
      const [cursorUpdatedAt, inbox, launch] = await Promise.all([
        ports.cursorUpdatedAt(instanceKey),
        ports.inboxSummary(trigger.instance),
        ports.lastLaunch(trigger),
      ]);
      return {
        projectId: trigger.projectId,
        recipeId: trigger.recipeId,
        triggerId: trigger.triggerId,
        sourceName: trigger.instance.sourceName,
        state: "active",
        scope: trigger.params,
        instance: {
          state: instance?.state ?? "not-running",
          lastPollAt: instance?.health?.lastPollAt,
          lastError: instance?.startError ?? instance?.health?.lastError,
        },
        cursorUpdatedAt,
        lastEventAt: inbox.lastEventAt,
        undelivered: inbox.undelivered,
        ...(launch === undefined
          ? {}
          : {
              lastLaunch: {
                runId: launch.launchId,
                status: launch.status,
                attempts: launch.attempts,
                lastError: launch.lastError,
                claimedAt: launch.claimedAt,
                launchedAt: launch.launchedAt,
              },
            }),
      };
    }),
  );
  return [...active, ...inactive.map(({ reason, ...trigger }) => ({ ...trigger, state: reason }))];
}
