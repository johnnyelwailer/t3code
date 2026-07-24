// @effect-diagnostics globalConsole:off -- fire-and-forget delivery failure log in a plain Promise path, outside any Effect runtime.
import { CommandId, MessageId, type OrchestrationCommand, ThreadId } from "@t3tools/contracts";

import { workflowStepDetailSnippet } from "./t3team-workflowEngineStepActivities.ts";

export function formatWorkflowOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined) return "Workflow completed.";
  if (output !== null && typeof output === "object" && !Array.isArray(output)) {
    const record = output as Record<string, unknown>;
    for (const key of ["summary", "message", "text", "result"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    const readable = Object.entries(record)
      .filter(
        ([, value]) =>
          ["string", "number", "boolean"].includes(typeof value) ||
          (Array.isArray(value) &&
            value.every((item) => ["string", "number", "boolean"].includes(typeof item))),
      )
      .map(([key, value]) => {
        const label = key.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
        return `**${label.charAt(0).toUpperCase()}${label.slice(1)}:** ${Array.isArray(value) ? value.join(", ") : String(value)}`;
      });
    if (readable.length > 0) return readable.join("\n");
    return "Workflow completed.";
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
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
}): Promise<void> {
  await postTerminalMessage({
    launchThreadId: input.launchThreadId,
    workflowRunId: input.workflowRunId,
    kind: "complete",
    text: formatWorkflowOutput(input.output),
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
export async function deliverWorkflowFailure(input: {
  readonly launchThreadId: string | undefined;
  readonly workflowRunId: string;
  readonly errorText: string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
}): Promise<void> {
  const reason = workflowStepDetailSnippet(input.errorText, 300);
  await postTerminalMessage({
    launchThreadId: input.launchThreadId,
    workflowRunId: input.workflowRunId,
    kind: "failed",
    text: `⚠️ Workflow run failed${reason.length > 0 ? `: ${reason}` : "."}\n\nThe run is no longer active. Fix the orchestration source and launch it again — call t3team_help("agent-orchestration") for the authoring format.`,
    dispatch: input.dispatch,
    newId: input.newId,
    nowIso: input.nowIso,
  });
}
