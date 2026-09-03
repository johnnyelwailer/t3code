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
/**
 * `errorText` sometimes carries a raw JSON object as its message (a thrown HTTP/tool error whose
 * `message` field IS the body). Interpolating that whole into the headline reads as "the bot is
 * broken" noise — extract just the `message` field when there is one, and drop the rest.
 */
const DROP = '"__t3team_dropped_object__"';

export function extractFailureHeadlineText(errorText: string): string {
  // Replace every embedded JSON object with its `message` field (or drop it): provider errors
  // arrive as `403: {"message":"…","type":"forbidden"}` inside otherwise readable prose.
  const stripObjects = (text: string): string =>
    text.replaceAll(/\{[^{}]*\}/g, (blob) => {
      try {
        const parsed: unknown = JSON.parse(blob);
        if (parsed !== null && typeof parsed === "object" && "message" in parsed) {
          const message = (parsed as { message: unknown }).message;
          return typeof message === "string" ? JSON.stringify(message) : DROP;
        }
        return DROP; // keeps an enclosing object parseable on the next pass
      } catch {
        return blob; // not JSON — keep the text
      }
    });
  // Innermost objects first; a nested body needs one pass per level.
  let withoutJson = errorText;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = stripObjects(withoutJson);
    if (next === withoutJson) break;
    withoutJson = next;
  }
  // Extracted messages come back JSON-quoted (so they nest safely); unquote them and drop the
  // placeholders left by objects that carried no message at all.
  withoutJson = withoutJson
    .replaceAll(DROP, "")
    .replaceAll(/"((?:[^"\\]|\\.)*)"/g, (_quoted, inner: string) =>
      inner.replaceAll('\\"', '"').replaceAll("\\\\", "\\"),
    );
  // The host's own bookkeeping suffix ("(step <id>, 3 re-drives exhausted)") is for logs, not
  // for the person reading the thread.
  return withoutJson
    .replace(/\s*\(step [^)]*\)\s*$/u, "")
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}

/**
 * The notice posted into the launch thread when a run fails. It is read by the PERSON in that
 * thread (the agent learns the outcome from the run status and the resume tool's own result), so
 * it names what stopped and what the person can do — never tool names or authoring instructions.
 */
export function buildWorkflowFailureText(input: {
  readonly errorText: string;
  /** `true` when the reader owns the run's source — an agent-authored ephemeral run. */
  readonly hostOwnsSource: boolean;
  /** `true` when the run row retained its pending step, so a resume can pick it back up — a
   *  host-detected step failure, not a launch-time or unrecoverable error. */
  readonly resumable?: boolean;
}): string {
  const reason = workflowStepDetailSnippet(extractFailureHeadlineText(input.errorText), 200);
  const because = reason.length > 0 ? ` ${reason.endsWith(".") ? reason : `${reason}.`}` : "";

  if (input.resumable === true) {
    return `⚠️ The orchestration stopped on an agent step that did not complete.${because}\n\nIts progress is kept — use Resume on the orchestration card (or ask the agent to resume it) to continue from that step.`;
  }
  return input.hostOwnsSource
    ? `⚠️ The orchestration stopped and cannot continue.${because}\n\nThe agent can correct it and start it again.`
    : `⚠️ The orchestration stopped and nothing was saved.${because}\n\nYou can start it again — if it keeps failing, the recipe itself needs a fix, so report the message above.`;
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
  /** See {@link buildWorkflowFailureText}. Defaults to `false` for funnels that cannot tell. */
  readonly resumable?: boolean;
}): Promise<void> {
  await postTerminalMessage({
    launchThreadId: input.launchThreadId,
    workflowRunId: input.workflowRunId,
    kind: "failed",
    text: buildWorkflowFailureText({
      errorText: input.errorText,
      hostOwnsSource: input.hostOwnsSource ?? true,
      resumable: input.resumable ?? false,
    }),
    dispatch: input.dispatch,
    newId: input.newId,
    nowIso: input.nowIso,
  });
}
