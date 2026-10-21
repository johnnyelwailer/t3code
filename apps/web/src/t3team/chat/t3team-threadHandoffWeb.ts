/**
 * Web side of "Move to" another machine (thread handoff): the successor's launch input, the
 * confirm copy and the outcome toast. The pipeline itself is `runThreadHandoff` in
 * client-runtime; watching the successor lives in `t3team-threadHandoffSuccessorLive`.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  ThreadHandoffOutcome,
  ThreadHandoffWorkspace,
} from "@t3tools/client-runtime/state/thread-handoff";
import type {
  EnvironmentId,
  ProjectId,
  T3TeamThreadHandoffCapture,
  ThreadId,
} from "@t3tools/contracts";

import { toastManager } from "~/components/ui/toast";
import { newMessageId } from "~/lib/utils";

/** Confirm copy for the move; `running` asks whether to stop the active turn now. */
export function handoffConfirmMessage(input: {
  readonly title: string;
  readonly sourceLabel: string;
  readonly targetLabel: string;
  readonly running: boolean;
}): string {
  const head = `Move "${input.title}" to ${input.targetLabel}?`;
  const body = `It continues there as a new thread that starts with this thread's history. This thread stays here, marked as moved. Anything not pushed stays on ${input.sourceLabel}.`;
  return input.running
    ? `${head}\n\nThe running turn stops once the new thread is running. ${body}`
    : `${head}\n\n${body}`;
}

export const WAIT_FOR_TURN_CONFIRM_MESSAGE =
  "Move it when the current turn ends instead? The move starts as soon as the turn finishes.";

type CommandResult<A> = { readonly _tag: "Success"; readonly value: A } | { readonly _tag: string };
export const unwrap = <A>(result: CommandResult<A>): A => {
  if (result._tag === "Success") return (result as { readonly value: A }).value;
  const failure = squashAtomCommandFailure(result as never);
  throw failure instanceof Error ? failure : new Error(String(failure));
};

export function announceThreadHandoff(
  outcome: ThreadHandoffOutcome,
  targetLabel: string,
  open: () => void,
) {
  if (outcome.type === "refused") {
    toastManager.add({
      type: "warning",
      title: "This thread can't move yet",
      description: outcome.refusals.map((refusal) => refusal.message).join("\n"),
    });
  } else if (outcome.type === "failed" && outcome.stage === "verify" && !outcome.successorStopped) {
    toastManager.add({
      type: "error",
      title: `Could not confirm the move to ${targetLabel}`,
      description: `${outcome.message} The new thread there may still be starting, so moving again now could start the work twice. Nothing changed here.`,
      actionProps: { children: "Open", onClick: open },
    });
  } else if (outcome.type === "failed") {
    toastManager.add({
      type: "error",
      title: `Could not move to ${targetLabel}`,
      description: `${outcome.message} Nothing changed here; you can try again.`,
    });
  } else {
    toastManager.add({
      type: outcome.warnings.length === 0 ? "success" : "warning",
      title: `Moved to ${targetLabel}`,
      ...(outcome.warnings.length > 0 ? { description: outcome.warnings.join("\n") } : {}),
      actionProps: { children: "Open", onClick: open },
    });
  }
}

/** The successor's `startTurn` input: one `launchThread` that creates it with its first message. */
export function successorLaunchInput(input: {
  readonly successorThreadId: ThreadId;
  readonly projectId: ProjectId;
  readonly shell: Pick<
    EnvironmentThreadShell,
    "modelSelection" | "runtimeMode" | "interactionMode"
  >;
  readonly capture: T3TeamThreadHandoffCapture;
  readonly workspace: ThreadHandoffWorkspace;
  readonly text: string;
}) {
  const createdAt = new Date().toISOString();
  const modes = {
    modelSelection: input.shell.modelSelection,
    runtimeMode: input.shell.runtimeMode,
    interactionMode: input.shell.interactionMode,
  };
  return {
    threadId: input.successorThreadId,
    message: {
      messageId: newMessageId(),
      role: "user" as const,
      text: input.text,
      attachments: [],
    },
    ...modes,
    bootstrap: {
      createThread: {
        projectId: input.projectId,
        title: input.capture.title,
        ...modes,
        branch: null,
        worktreePath: null,
        createdAt,
      },
      ...(input.workspace.type === "worktree"
        ? {
            prepareWorktree: {
              // The target resolves its own checkout; launchThread never reads it.
              projectCwd: "",
              baseBranch: input.workspace.baseBranch,
              startFromOrigin: input.workspace.startFromOrigin,
              requireWorktree: true,
            },
            runSetupScript: true,
          }
        : {}),
    },
    createdAt,
  };
}
