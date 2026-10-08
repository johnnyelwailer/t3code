/**
 * `launchThread` on the host: find the key's thread, or launch it through `ThreadLaunchService`
 * (what `t3_thread_launch` uses), then record who launched it. The thread id and the launch
 * command id are derived from (project, scope, key), so a second launch of a key finds the
 * thread and a retried one replays the service's receipt.
 */
import {
  CommandId,
  MessageId,
  T3TEAM_LAUNCHED_BY_FACT_KEY,
  ThreadId,
  type T3TeamLaunchedByFact,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ThreadLaunchService } from "./orchestration-v2/ThreadLaunchService.ts";
import type { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import type { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import { answer, authorOf, refuse } from "./t3team-workflowHostLaunchShared.ts";
import type { WorkflowHostLaunchThreadInput } from "./t3team-workflowHostPort.ts";
import { launchedThreadIdentity } from "./t3team-workflowLaunchedThreadIds.ts";
import { workflowPromptContext } from "./t3team-workflowTurnPrompt.ts";

export function makeHostLaunchThread(deps: {
  readonly threads: ThreadManagementService["Service"];
  readonly launches: Option.Option<ThreadLaunchService["Service"]>;
  readonly facts: T3TeamThreadFactsStore["Service"];
}) {
  const { threads, facts } = deps;
  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
  return (input: WorkflowHostLaunchThreadInput) =>
    Effect.gen(function* () {
      const identity = launchedThreadIdentity(input);
      const threadId = ThreadId.make(identity.threadId);
      const existing = yield* threads.getThreadShell(threadId);
      if (existing !== null && existing.projectId !== input.projectId) {
        return yield* refuse(`Thread ${threadId} belongs to another project.`);
      }
      if (existing === null) {
        if (Option.isNone(deps.launches)) return yield* refuse("This host cannot launch threads.");
        yield* deps.launches.value.launch({
          commandId: CommandId.make(identity.commandId),
          threadId,
          projectId: input.projectId,
          title: input.title,
          modelSelection: input.modelSelection,
          runtimeMode: input.runtimeMode,
          interactionMode: input.interactionMode,
          workspaceStrategy: input.workspace,
          ...(input.message === undefined
            ? {}
            : {
                initialMessage: {
                  messageId: MessageId.make(`${identity.commandId}:message`),
                  text: input.message,
                  attachments: [],
                  context: workflowPromptContext(authorOf(input.runId)),
                },
              }),
          createdBy: "system",
          creationSource: "server",
        });
      }
      // The latest run to launch or adopt the key owns it; replays write the same value.
      const launchedBy: T3TeamLaunchedByFact = {
        runId: input.runId,
        launchThreadId:
          input.launchThreadId === undefined ? null : ThreadId.make(input.launchThreadId),
        scope: input.scope,
        key: input.key,
        launchedAt: yield* nowIso,
      };
      const previous = (yield* facts.get(threadId))?.extensions?.[T3TEAM_LAUNCHED_BY_FACT_KEY] as
        | T3TeamLaunchedByFact
        | undefined;
      if (
        previous?.runId !== input.runId ||
        previous.launchThreadId !== launchedBy.launchThreadId
      ) {
        yield* facts.upsert(threadId, {
          extensions: { [T3TEAM_LAUNCHED_BY_FACT_KEY]: launchedBy },
        });
      }
      return answer({ threadId: identity.threadId, created: existing === null });
    });
}
