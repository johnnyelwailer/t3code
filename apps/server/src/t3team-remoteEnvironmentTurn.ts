/**
 * One local turn of a `remoteEnvironment` thread, read from the remote thread's projection and
 * written as local adapter events. Pure: the session runtime (`t3team-remoteEnvironmentSession.ts`)
 * feeds it projections and publishes what it returns.
 *
 * The remote run is the one whose `userMessageId` is the local turn's message id (the session
 * dispatches the turn under that id). Its assistant messages become local assistant messages
 * (streaming until the run ends) and its terminal status becomes the local `turn.terminal`.
 * The events themselves are built in `t3team-remoteEnvironmentTurnEvents.ts`.
 */
import {
  type OrchestrationV2RunStatus,
  type OrchestrationV2ThreadProjection,
  ProviderDriverKind,
  type RunId,
} from "@t3tools/contracts";

export const REMOTE_ENVIRONMENT_DRIVER = ProviderDriverKind.make("remoteEnvironment");

export type RemoteTurnTerminal =
  | { readonly status: "completed" | "interrupted" | "cancelled" }
  | { readonly status: "failed"; readonly message: string };

export interface RemoteTurnProgress {
  /** Null until the remote server has started a run for the turn's message. */
  readonly runId: RunId | null;
  readonly assistant: ReadonlyArray<{ readonly id: string; readonly text: string }>;
  readonly terminal: RemoteTurnTerminal | null;
}

const TERMINAL: Partial<Record<OrchestrationV2RunStatus, RemoteTurnTerminal["status"]>> = {
  completed: "completed",
  interrupted: "interrupted",
  cancelled: "cancelled",
  rolled_back: "cancelled",
  failed: "failed",
};

export function remoteTurnProgress(
  projection: Pick<OrchestrationV2ThreadProjection, "runs" | "messages" | "turnItems">,
  messageId: string,
): RemoteTurnProgress {
  const run = projection.runs.find((candidate) => candidate.userMessageId === messageId);
  if (run === undefined) return { runId: null, assistant: [], terminal: null };
  const assistant = projection.messages
    .filter((message) => message.runId === run.id && message.role === "assistant")
    .map((message) => ({ id: message.id, text: message.text }));
  const status = TERMINAL[run.status];
  const failure = projection.turnItems
    .flatMap((item) =>
      item.runId === run.id && item.type === "error" ? [item.failure.message] : [],
    )
    .at(-1);
  const last = failure ?? assistant.at(-1)?.text.trim();
  const terminal: RemoteTurnTerminal | null =
    status === undefined
      ? null
      : status === "failed"
        ? {
            status,
            message: `The child's run on the cloud session failed${last ? `: ${last.slice(0, 500)}` : "."}`,
          }
        : { status };
  return { runId: run.id, assistant, terminal };
}
