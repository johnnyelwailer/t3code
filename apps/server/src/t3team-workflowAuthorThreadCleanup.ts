/**
 * Retiring the hidden author thread. Its id is deterministic (`<runId>:author`,
 * `t3team-workflowAuthorTurn.ts`), so every outcome can retire it even when the process-local
 * session is gone (a restart): unfixable/timeout/stop/replace retire it at once; a successful
 * author is kept for runtime repairs and retired when the RUN ends. Interrupt first (a turn may be
 * mid-flight), then archive. Best-effort: a thread that never existed or is already archived is
 * not an error anyone can act on.
 */
import {
  workflowAuthorSessionForRun,
  workflowAuthorThreadId,
} from "./t3team-workflowAuthorSession.ts";
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";

export async function retireWorkflowAuthorThread(input: {
  readonly runId: string;
  readonly host: Pick<WorkflowHostPort, "interrupt" | "archiveThread">;
  /** Retire even without a live session (boot rehydration of an interrupted authoring row). */
  readonly force?: boolean;
}): Promise<void> {
  const session = workflowAuthorSessionForRun(input.runId);
  if (session === undefined && input.force !== true) return;
  if (session !== undefined) {
    session.submit = undefined;
    session.declined = true;
  }
  const threadId = session?.authorThreadId ?? workflowAuthorThreadId(input.runId);
  await input.host.interrupt({ threadId, reason: "Orchestration author retired" }).catch(() => {});
  await input.host.archiveThread(threadId).catch(() => {});
}
