/**
 * Live wiring for the `t3team.thread.children` broker tool: builds the
 * `T3TeamChildrenToolDeps` the pure handler needs over the V2 thread
 * management service, the thread-facts store (environment bindings) and the
 * mailbox / silence-watch ports, and returns the `(toolArgs, callerThreadId)`
 * closure the binding dispatch calls.
 *
 * @module t3team-toolBrokerChildrenLive
 */
import { CommandId, type ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { callT3TeamChildrenTool } from "./t3team-toolBrokerChildren.ts";
import {
  T3TeamMailboxDrainPort,
  T3TeamSilenceWatchPort,
} from "./t3team-toolBrokerChildrenPorts.ts";
import type {
  EnvironmentBindingSummary,
  T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

const message = (error: unknown): string =>
  typeof error === "string" ? error : error instanceof Error ? error.message : String(error);

/** Groups recorded environment facts per environment, newest first. */
export function summarizeEnvironmentBindings(
  facts: ReadonlyArray<{
    readonly environment?:
      | { readonly environmentId: string; readonly label?: string | undefined }
      | null
      | undefined;
    readonly updatedAt: string;
  }>,
): ReadonlyArray<EnvironmentBindingSummary> {
  const byId = new Map<string, { label?: string; threadCount: number; latestThreadAt: string }>();
  for (const fact of [...facts].toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const environment = fact.environment;
    if (!environment) continue;
    const entry = byId.get(environment.environmentId);
    if (entry) {
      entry.threadCount += 1;
      continue;
    }
    byId.set(environment.environmentId, {
      ...(environment.label ? { label: environment.label } : {}),
      threadCount: 1,
      latestThreadAt: fact.updatedAt,
    });
  }
  return [...byId].map(([environmentId, entry]) => ({ environmentId, ...entry }));
}

export const makeManageChildrenHandler = (input: { readonly localEnvironmentId?: string }) =>
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const facts = yield* T3TeamThreadFactsStore;
    const mailbox = yield* T3TeamMailboxDrainPort;
    const silenceWatch = yield* T3TeamSilenceWatchPort;
    const nowIso = () => DateTime.formatIso(DateTime.nowUnsafe());

    const loadThreadShell: T3TeamChildrenToolDeps["loadThreadShell"] = (threadId) =>
      threads.getThreadShell(threadId).pipe(
        Effect.map((shell) => shell ?? undefined),
        Effect.mapError(message),
      );
    const listProjectThreadShells: T3TeamChildrenToolDeps["listProjectThreadShells"] = (
      projectId,
    ) =>
      threads
        .listProjectThreads({ projectId, includeSubagents: true })
        .pipe(Effect.mapError(message));
    const settleThread: T3TeamChildrenToolDeps["settleThread"] = (threadId) =>
      threads
        .dispatch({
          type: "thread.settle",
          commandId: CommandId.make(`server:t3team:children:sweep:${t3teamRandomUUID()}`),
          threadId,
        })
        .pipe(Effect.asVoid, Effect.mapError(message));
    const listEnvironmentBindings: T3TeamChildrenToolDeps["listEnvironmentBindings"] = () =>
      facts.list().pipe(Effect.map(summarizeEnvironmentBindings), Effect.mapError(message));

    return (toolArgs: unknown, callerThreadId: ThreadId): Effect.Effect<T3TeamToolCallResult> =>
      loadThreadShell(callerThreadId).pipe(
        Effect.flatMap((caller) => {
          if (!caller) return Effect.succeed(errorResult("Current t3team thread was not found."));
          const drainOwn = mailbox.drainOwn;
          const deps: T3TeamChildrenToolDeps = {
            callerThreadId,
            callerProjectId: caller.projectId,
            localEnvironmentId: input.localEnvironmentId,
            loadThreadShell,
            listProjectThreadShells,
            settleThread,
            listEnvironmentBindings,
            drainOwnMailbox: drainOwn === null ? undefined : () => drainOwn(callerThreadId),
            silenceWatch: silenceWatch.watch ?? undefined,
            nowIso,
          };
          return callT3TeamChildrenTool({ toolArgs, deps });
        }),
        Effect.catch((error) =>
          Effect.succeed(errorResult(`Failed to manage child sessions: ${error}`)),
        ),
      );
  });
