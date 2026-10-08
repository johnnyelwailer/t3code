/**
 * The host side of `launchThread` (t3team-sdk.launchedThreads.ts): top-level threads a workflow
 * launches through `ThreadLaunchService` (what `t3_thread_launch` uses) and keeps addressing by
 * key, plus the run's own facts.
 *
 * - A launched thread is top-level, never a subagent, so it can watch a pull request and it
 *   outlives the run. Its `t3team.launchedBy` fact records the run, home thread, scope and key.
 * - The thread id is derived from (project, scope, key) and the launch command id with it, so a
 *   second launch of a key finds the thread, and a retried one replays its receipt.
 * - A verb reaches only a thread whose `t3team.launchedBy` scope and key are the caller's: a body
 *   cannot steer the user's other threads. A watch it starts links as `agent`, so upstream's
 *   rule that an agent cannot re-watch after the user's Stop applies to it unchanged.
 */
import {
  CommandId,
  MessageId,
  T3TEAM_LAUNCHED_BY_FACT_KEY,
  ThreadId,
  type OrchestrationV2ThreadShell,
  type T3TeamLaunchedByFact,
} from "@t3tools/contracts";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import { modelSelectionCommandType } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ThreadLaunchService } from "./orchestration-v2/ThreadLaunchService.ts";
import type { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import type { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import { workflowPromptContext } from "./t3team-workflowTurnPrompt.ts";
import { launchedThreadState } from "./t3team-workflowHostLaunchState.ts";
import {
  answer,
  authorOf,
  refusalOf,
  refuse,
  reservedFactKey,
} from "./t3team-workflowHostLaunchShared.ts";
import { makeHostLaunchThread } from "./t3team-workflowHostLaunchThread.ts";
import type {
  WorkflowHostLaunchedThreadInput,
} from "./t3team-workflowHostPort.ts";

export function makeWorkflowHostLaunch(deps: {
  readonly threads: ThreadManagementService["Service"];
  readonly launches: Option.Option<ThreadLaunchService["Service"]>;
  readonly facts: T3TeamThreadFactsStore["Service"];
}) {
  const { threads, facts } = deps;
  const launchThread = makeHostLaunchThread(deps);

  /** The thread, when the caller's scope and key launched it. */
  const owned = (input: WorkflowHostLaunchedThreadInput) =>
    Effect.gen(function* () {
      const threadId = ThreadId.make(input.threadId);
      const shell = yield* threads.getThreadShell(threadId);
      const launchedBy = (yield* facts.get(threadId))?.extensions?.[T3TEAM_LAUNCHED_BY_FACT_KEY] as
        | T3TeamLaunchedByFact
        | undefined;
      return shell !== null &&
        shell.projectId === input.projectId &&
        launchedBy?.scope === input.scope &&
        launchedBy.key === input.key
        ? shell
        : null;
    });

  const watch = (
    shell: OrchestrationV2ThreadShell,
    url: string,
    watching: boolean,
    request: string,
  ) =>
    Effect.gen(function* () {
      const target = parseChangeRequestUrl(url);
      if (target === null) return yield* refuse(`Not a pull request URL: ${url}`);
      const dispatched = yield* threads
        .dispatch({
          type: "thread.pull-request.watch",
          commandId: CommandId.make(`t3team-wf:watch:${request}`),
          threadId: shell.id,
          host: target.host,
          repository: target.repository,
          number: target.number,
          watching,
          ...(watching ? { link: { url, source: "agent" as const } } : {}),
        })
        .pipe(Effect.result);
      // The orchestrator's refusals (the user stopped the thread, it is settled) are answers.
      if (dispatched._tag === "Failure") return yield* refuse(refusalOf(dispatched.failure));
      return answer(undefined);
    });

  const launchedThread = (input: WorkflowHostLaunchedThreadInput) =>
    Effect.gen(function* () {
      const shell = yield* owned(input);
      if (shell === null) {
        return yield* refuse(`Thread ${input.threadId} was not launched by this recipe.`);
      }
      const op = input.op;
      const request = `${shell.id}:${input.requestId}`;
      switch (op.op) {
        case "watch":
          return yield* watch(shell, op.url, op.watching, request);
        case "send":
          yield* threads.dispatch({
            type: "message.dispatch",
            commandId: CommandId.make(`t3team-wf:send:${request}`),
            threadId: shell.id,
            messageId: MessageId.make(`t3team-wf-launched:${input.requestId}`),
            text: op.text,
            context: workflowPromptContext(authorOf(input.runId)),
            attachments: [],
            dispatchMode: { type: "queue_after_active" },
            createdBy: "system",
            creationSource: "server",
          });
          return answer(undefined);
        case "configure":
          if (op.modelSelection !== undefined) {
            yield* threads.dispatch({
              type: modelSelectionCommandType(shell.providerInstanceId, op.modelSelection),
              commandId: CommandId.make(`t3team-wf:model:${request}`),
              threadId: shell.id,
              modelSelection: op.modelSelection,
            });
          }
          if (op.runtimeMode !== undefined && op.runtimeMode !== shell.runtimeMode) {
            yield* threads.dispatch({
              type: "thread.runtime-mode.set",
              commandId: CommandId.make(`t3team-wf:mode:${request}`),
              threadId: shell.id,
              runtimeMode: op.runtimeMode,
            });
          }
          return answer(undefined);
        case "read":
          return answer(launchedThreadState(shell));
        case "facts": {
          const reserved = reservedFactKey(op.extensions);
          if (reserved !== undefined) return yield* refuse(`Fact key ${reserved} is the host's.`);
          yield* facts.upsert(shell.id, { extensions: { ...op.extensions } });
          return answer(undefined);
        }
      }
    });

  const setRunFacts = (input: {
    readonly launchThreadId: string;
    readonly extensions: Readonly<Record<string, unknown>>;
  }) =>
    Effect.gen(function* () {
      const reserved = reservedFactKey(input.extensions);
      if (reserved !== undefined) return yield* refuse(`Fact key ${reserved} is the host's.`);
      yield* facts.upsert(ThreadId.make(input.launchThreadId), {
        extensions: { ...input.extensions },
      });
      return answer(undefined);
    });

  return { launchThread, launchedThread, setRunFacts };
}
