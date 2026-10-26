/**
 * The workflow facts of a launch thread, derived from the durable `workflow_runs` table: the
 * latest run's status (the sidebar's status pill) and the soonest wake of its sleeping runs (the
 * dormant-routine pill). They travel on the fork thread-facts side stream
 * (`T3TeamThreadFactsStore`); the host re-derives and patches them on every run transition.
 */
import { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/sql/SqlClient";

import type { T3TeamThreadFactsPatch } from "./t3team-v2/t3team-threadFactsStore.ts";

// A row whose status the contract does not know (schema drift) reads as "no run".
const decodeLatestRun = Schema.decodeUnknownOption(OrchestrationWorkflowRunStatus);

function workflowIdentity(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  const basename = path.split(/[/\\]/).filter(Boolean).at(-1);
  const title = basename
    ?.replace(/\.workflow\.ts$/, "")
    .replace(/\.ts$/, "")
    .trim();
  return title || undefined;
}

function intentGoal(intentJson: unknown): string | undefined {
  if (typeof intentJson !== "string") return undefined;
  try {
    const goal = (JSON.parse(intentJson) as { goal?: unknown }).goal;
    return typeof goal === "string" && goal.trim() ? goal.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** The facts patch for `launchThreadId`; a thread that never launched a run clears both facts. */
export const readWorkflowRunFacts = (sql: SqlClient.SqlClient, launchThreadId: string) =>
  Effect.gen(function* () {
    const latestRows = yield* sql`
      SELECT run_id AS "runId", status, pending_kind AS "pendingKind", wake_at AS "wakeAt",
        updated_at AS "updatedAt", origin, intent_json AS "intentJson",
        workflow_path AS "workflowPath", recipe_path AS "recipePath"
      FROM workflow_runs WHERE launch_thread_id = ${launchThreadId}
      ORDER BY updated_at DESC, run_id DESC LIMIT 1
    `;
    const sleepingRows = yield* sql<{ readonly wakeAt: string }>`
      SELECT wake_at AS "wakeAt" FROM workflow_runs
      WHERE status = 'sleeping' AND wake_at IS NOT NULL AND launch_thread_id = ${launchThreadId}
      ORDER BY wake_at ASC LIMIT 1
    `;
    const latest = latestRows[0] as
      | {
          readonly runId?: unknown;
          readonly origin?: unknown;
          readonly intentJson?: unknown;
          readonly workflowPath?: unknown;
          readonly recipePath?: unknown;
        }
      | undefined;
    const runId = typeof latest?.runId === "string" ? latest.runId : undefined;
    // A recipe's body is conventionally `workflow.ts`, whose basename names nothing.
    const bodyName = workflowIdentity(latest?.workflowPath);
    const recipeName = workflowIdentity(latest?.recipePath);
    const durableTitle =
      (latest?.origin === "ephemeral" ? intentGoal(latest.intentJson) : undefined) ??
      (bodyName === "workflow" ? (recipeName ?? bodyName) : (bodyName ?? recipeName));
    const projected =
      latest === undefined
        ? undefined
        : {
            ...latest,
            ...(durableTitle ? { title: durableTitle } : {}),
            ...(runId ? { messageId: `t3team-wf-shape:${runId}` } : {}),
          };
    return {
      workflowRunStatus: Option.getOrNull(decodeLatestRun(projected)),
      sleepingUntil: sleepingRows[0]?.wakeAt ?? null,
    } satisfies T3TeamThreadFactsPatch;
  });
