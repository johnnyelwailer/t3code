/**
 * The trigger runner's wiring onto durable state (S5b): the policy engine's ports read their limits
 * from the launch ledger and claim through it, and the launcher's ports turn a claimed ledger row
 * into a headless run under the row's own id. Split from the runner layer so the layer stays the
 * service shell and these adapters stay readable.
 */
import { ProjectId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import type { WorkflowRunRepositoryShape } from "./persistence/WorkflowRuns.ts";
import type { WorkflowTriggerLaunchStoreShape } from "./persistence/t3team-WorkflowTriggerLaunchStore.ts";
import { launchHeadlessRecipeWorkflow } from "./t3team-recipeHeadlessLaunch.ts";
import type { RecipeTriggerLauncherPorts } from "./t3team-recipeTriggerLauncher.ts";
import type { TriggerRunnerAmbient } from "./t3team-recipeTriggerRunnerAmbient.ts";
import type {
  LiveTrigger,
  RecipeTriggerEnginePorts,
  RecipeTriggerSlice,
} from "./t3team-recipeTriggerRunnerCore.ts";

const isoAt = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));
const nowMs = () => DateTime.toEpochMillis(DateTime.nowUnsafe());

const sliceOf = (slice: RecipeTriggerSlice) => ({
  sourceName: slice.instance.sourceName,
  paramsHash: slice.instance.paramsHash,
  signalName: slice.instance.signalName,
  key: slice.key,
  upToId: slice.upToId,
});

export function makeTriggerEnginePorts(input: {
  readonly ledger: WorkflowTriggerLaunchStoreShape;
  readonly ambient: TriggerRunnerAmbient;
  readonly newLaunchId: () => string;
  readonly launch: (request: Parameters<RecipeTriggerEnginePorts["launch"]>[0]) => void;
}): RecipeTriggerEnginePorts {
  const { ledger, ambient } = input;
  return {
    nowMs,
    log: ambient.log,
    newLaunchId: input.newLaunchId,
    launch: input.launch,
    history: async ({ recipeId, triggerId, windowStartMs, intervalStartMs }) => {
      const history = await ambient.runLedger(
        ledger.history({
          recipeId,
          triggerId,
          windowStartIso: isoAt(windowStartMs),
          intervalStartIso: isoAt(intervalStartMs),
        }),
      );
      return {
        inFlight: history.inFlight,
        launchesInWindow: history.launchesInWindow,
        lastLaunchAtMsByKey: new Map(
          [...history.lastClaimAtByKey].map(([key, at]) => [key, Date.parse(at)]),
        ),
      };
    },
    claim: ({ request, ...slice }) =>
      ambient.runLedger(
        ledger.claim({
          ...sliceOf(slice),
          launchId: request.launchId,
          projectId: request.projectId,
          recipeId: request.recipeId,
          triggerId: request.triggerId,
          args: request.args,
          claimedAt: isoAt(nowMs()),
        }),
      ),
    consume: (slice) =>
      ambient.runLedger(ledger.consume({ ...sliceOf(slice), deliveredAt: isoAt(nowMs()) })),
  };
}

export function makeTriggerLauncherPorts(input: {
  readonly ledger: WorkflowTriggerLaunchStoreShape;
  readonly runs: WorkflowRunRepositoryShape;
  readonly ambient: TriggerRunnerAmbient;
  readonly liveTriggers: () => ReadonlyArray<LiveTrigger>;
  readonly nowMs?: () => number;
}): RecipeTriggerLauncherPorts {
  const { ledger, runs, ambient } = input;
  return {
    nowMs: input.nowMs ?? nowMs,
    log: ambient.log,
    markLaunched: (launchId, launchedAtMs) =>
      ambient.runLedger(ledger.markLaunched({ launchId, launchedAt: isoAt(launchedAtMs) })),
    markAttemptFailed: ({ launchId, error, nextAttemptAtMs, giveUp }) =>
      ambient.runLedger(
        ledger.markAttemptFailed({
          launchId,
          error,
          nextAttemptAt: isoAt(nextAttemptAtMs),
          giveUp,
        }),
      ),
    listDue: async (atMs, limit) => {
      const rows = await ambient.runLedger(ledger.listDue({ nowIso: isoAt(atMs), limit }));
      return rows.map((row) => ({
        attempts: row.attempts,
        request: {
          launchId: row.launchId,
          projectId: row.projectId,
          recipeId: row.recipeId,
          triggerId: row.triggerId,
          key: row.key,
          args: row.args,
        },
      }));
    },
    runExists: async (runId) => Option.isSome(await ambient.runLedger(runs.getById({ runId }))),
    start: async (request, onAdmitted) => {
      const trigger = input
        .liveTriggers()
        .find(
          (c) =>
            c.projectId === request.projectId &&
            c.recipeId === request.recipeId &&
            c.triggerId === request.triggerId,
        );
      if (trigger === undefined || trigger.modelSelection === null) {
        throw new Error("trigger no longer registered (settings or model selection changed)");
      }
      await ambient.runLaunch(
        launchHeadlessRecipeWorkflow({
          projectId: ProjectId.make(request.projectId),
          workspaceRoot: trigger.workspaceRoot,
          recipePath: trigger.recipePath,
          workflowPath: trigger.workflowPath,
          recipe: {
            id: trigger.recipeId,
            ...(trigger.action === "default" ? {} : { action: trigger.action }),
          },
          args: request.args,
          modelSelection: trigger.modelSelection,
          allowedToolGroups: trigger.allowedToolGroups,
          origin: "trigger",
          runId: request.launchId,
          onAdmitted,
        }),
      );
    },
  };
}
