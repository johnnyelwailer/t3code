// @effect-diagnostics globalConsole:off -- fire-and-forget delivery failure log in a plain Promise path, outside any Effect runtime.
import {
  CommandId,
  MessageId,
  type OrchestrationCommand,
  type T3TeamMessageAttachment,
  ThreadId,
} from "@t3tools/contracts";
import { renderWorkflowRecordAsDisplayText } from "@t3tools/shared/t3team-workflowOutputText";

import { workflowCompletionDraftRef } from "./t3team-workflowCompletionDraftRef.ts";
import { workflowStepDetailSnippet } from "./t3team-workflowEngineStepActivities.ts";

/**
 * Formats a run's output as the terminal chat message's text — BEFORE it is ever stored (see
 * `postTerminalMessage` below). The rich record rendering (never dropping a nested field,
 * truncating visibly) lives in the shared `renderWorkflowRecordAsDisplayText`, also used by the
 * web client's `t3team-workflowCompletionDisplayText.ts` for re-rendering legacy raw-JSON text.
 */
export function formatWorkflowOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined) return "Workflow completed.";
  if (output !== null && typeof output === "object" && !Array.isArray(output)) {
    return renderWorkflowRecordAsDisplayText(output as Record<string, unknown>, {
      emptyFallback: "Workflow completed.",
    });
  }
  try {
    return JSON.stringify(output, null, 2) ?? String(output);
  } catch {
    return String(output);
  }
}

/**
 * Post the run's single terminal message into the launching chat. Completion and
 * failure share ONE stable per-run message id, so whichever terminal outcome
 * lands last overwrites the other — a transient failure notice can never sit
 * contradicting a later success (or vice versa) in the same thread.
 */
async function postTerminalMessage(input: {
  readonly launchThreadId: string | undefined;
  readonly workflowRunId: string;
  readonly kind: "complete" | "failed";
  readonly text: string;
  /** Structured card data for clients that render one; the text stays the fallback. */
  readonly attachments?: ReadonlyArray<T3TeamMessageAttachment>;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
}): Promise<void> {
  if (input.launchThreadId === undefined) return;
  await input
    .dispatch({
      type: "thread.message.upsert",
      commandId: CommandId.make(`t3team-wf:${input.kind}:${input.newId()}`),
      threadId: ThreadId.make(input.launchThreadId),
      message: {
        messageId: MessageId.make(`t3team-wf-result:${input.workflowRunId}`),
        role: "assistant",
        text: input.text,
        turnId: null,
        streaming: false,
        ...(input.attachments === undefined || input.attachments.length === 0
          ? {}
          : { t3teamExt: { attachments: input.attachments } }),
      },
      createdAt: input.nowIso(),
    })
    .catch((error: unknown) => {
      // Never fail the caller over a notification, but never swallow silently
      // either — an undelivered terminal notice is exactly the "agent thinks
      // it's still running" bug this module exists to prevent.
      console.warn(
        `[t3team-workflow] failed to deliver terminal ${input.kind} message for run ${input.workflowRunId}:`,
        error,
      );
    });
}

export async function deliverWorkflowCompletion(input: {
  readonly launchThreadId: string | undefined;
  readonly workflowRunId: string;
  readonly output: unknown;
  /** The run's project, so a proposal card can navigate to the work item. */
  readonly projectId?: string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
}): Promise<void> {
  // A run that proposed a draft also carries a card ref (see t3team-workflowCompletionDraftRef.ts).
  // The TEXT is unchanged either way: a client that renders no card still reads the same summary.
  const draftRef = workflowCompletionDraftRef(input.output, input.projectId);
  await postTerminalMessage({
    launchThreadId: input.launchThreadId,
    workflowRunId: input.workflowRunId,
    kind: "complete",
    text: formatWorkflowOutput(input.output),
    ...(draftRef === undefined ? {} : { attachments: [draftRef] }),
    dispatch: input.dispatch,
    newId: input.newId,
    nowIso: input.nowIso,
  });
}

/**
 * Post a terminal FAILURE notice into the launching chat. Without this the
 * launching agent only ever saw "accepted" and hallucinated progress forever —
 * the Work Log knew the run died (step activities), but no message reached the
 * conversation.
 */
/**
 * The failure notice, written for whoever can actually act on it.
 *
 * An agent-authored (ephemeral) run's source belongs to the agent in the conversation, so telling it to
 * fix the source and re-launch is correct — that reader can do exactly that.
 *
 * A BUNDLED or project recipe is shipped code. Its run was started by a human clicking a button, and
 * that human cannot edit the recipe's source; self-heal does not apply either (`repairIntent` is only
 * set for the ephemeral case). Handing them "Fix the orchestration source … call
 * t3team_help("agent-orchestration")" is agent-facing text pointed at the one reader who has no way to
 * comply, and it hides the only thing they can do.
 */
export function buildWorkflowFailureText(input: {
  readonly errorText: string;
  /** `true` when the reader owns the run's source — an agent-authored ephemeral run. */
  readonly hostOwnsSource: boolean;
}): string {
  const reason = workflowStepDetailSnippet(input.errorText, 300);
  const headline = `⚠️ Workflow run failed${reason.length > 0 ? `: ${reason}` : "."}`;

  return input.hostOwnsSource
    ? `${headline}\n\nThe run is no longer active. Fix the orchestration source and launch it again — call t3team_help("agent-orchestration") for the authoring format.`
    : `${headline}\n\nThe run stopped here and nothing was saved. You can start it again — if it keeps failing, the recipe itself needs a fix, so report the message above.`;
}

export async function deliverWorkflowFailure(input: {
  readonly launchThreadId: string | undefined;
  readonly workflowRunId: string;
  readonly errorText: string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
  /** Defaults to the agent-authored wording, so a funnel that cannot tell keeps today's text. */
  readonly hostOwnsSource?: boolean;
}): Promise<void> {
  await postTerminalMessage({
    launchThreadId: input.launchThreadId,
    workflowRunId: input.workflowRunId,
    kind: "failed",
    text: buildWorkflowFailureText({
      errorText: input.errorText,
      hostOwnsSource: input.hostOwnsSource ?? true,
    }),
    dispatch: input.dispatch,
    newId: input.newId,
    nowIso: input.nowIso,
  });
}
