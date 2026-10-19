import {
  MessageId,
  ProjectId,
  ThreadId,
  type ModelSelection,
  type OrchestrationMessageContext,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { ThreadBootstrapProgressTracker } from "~/t3team/chat/t3team-threadBootstrapProgress";
import { randomUUID } from "~/lib/utils";

/**
 * The non-workflow kickoff: one `thread.turn.start` that creates the durable thread
 * (`bootstrap.createThread`) and starts the turn in the same dispatch.
 *
 * Both visible steps — "create" and "launch" — ride this single RPC, so they move together:
 * busy while the dispatch is in flight, done (or errored) together when it settles. The view
 * additionally marks "create" done the moment the server shell arrives, which is the moment the
 * thread content switches from the launch panel to the live timeline.
 */
export async function runThreadBootstrapPlainStart(input: {
  backend: BackendApi;
  threadId: string;
  canonicalProjectId: string;
  title: string;
  message: string;
  messageContext: OrchestrationMessageContext | undefined;
  kickoffModelSelection: ModelSelection;
  kickoffRuntimeMode: RuntimeMode;
  kickoffInteractionMode: ProviderInteractionMode;
  kickoffBranch: string | null;
  createdAt: string;
  serverThreadExists: boolean;
  tracker: ThreadBootstrapProgressTracker | undefined;
}): Promise<void> {
  const { tracker, ...rest } = input;
  tracker?.begin("create");
  tracker?.begin("launch");
  try {
    await rest.backend.orchestration.startThreadTurn({
      threadId: ThreadId.make(rest.threadId),
      message: {
        messageId: MessageId.make(randomUUID()),
        role: "user",
        text: rest.message,
        attachments: [],
        ...(rest.messageContext ? { context: rest.messageContext } : {}),
      },
      modelSelection: rest.kickoffModelSelection,
      titleSeed: rest.title,
      runtimeMode: rest.kickoffRuntimeMode,
      interactionMode: rest.kickoffInteractionMode,
      ...(rest.serverThreadExists
        ? {}
        : {
            bootstrap: {
              createThread: {
                projectId: ProjectId.make(rest.canonicalProjectId),
                title: rest.title,
                modelSelection: rest.kickoffModelSelection,
                runtimeMode: rest.kickoffRuntimeMode,
                interactionMode: rest.kickoffInteractionMode,
                branch: rest.kickoffBranch,
                worktreePath: null,
                createdAt: rest.createdAt,
              },
            },
          }),
    });
    tracker?.complete("create");
    tracker?.complete("launch");
  } catch (error) {
    tracker?.fail("create", error);
    tracker?.fail("launch", error);
    throw error;
  }
}
