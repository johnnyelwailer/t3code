/**
 * Retiring the hidden author thread. Its id is deterministic (`<runId>:author`,
 * `t3team-workflowAuthorTurn.ts`), so every outcome can retire it even when the process-local
 * session is gone (a restart): unfixable/timeout/stop/replace retire it at once; a successful
 * author is kept for runtime repairs and retired when the RUN ends. Interrupt first (a turn may be
 * mid-flight), then archive. Best-effort: a thread that never existed or is already archived is
 * not an error anyone can act on.
 */
import { CommandId, ThreadId, type OrchestrationCommand } from "@t3tools/contracts";

import { workflowAuthorSessionForRun } from "./t3team-workflowAuthorSession.ts";

export const workflowAuthorThreadId = (runId: string): string => `${runId}:author`;

export async function retireWorkflowAuthorThread(input: {
  readonly runId: string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
  /** Retire even without a live session (boot rehydration of an interrupted authoring row). */
  readonly force?: boolean;
}): Promise<void> {
  const session = workflowAuthorSessionForRun(input.runId);
  if (session === undefined && input.force !== true) return;
  if (session !== undefined) {
    session.submit = undefined;
    session.declined = true;
  }
  const threadId = ThreadId.make(session?.authorThreadId ?? workflowAuthorThreadId(input.runId));
  await input
    .dispatch({
      type: "thread.turn.interrupt",
      commandId: CommandId.make(`t3team-wf:author:retire-interrupt:${input.newId()}`),
      threadId,
      createdAt: input.nowIso(),
    })
    .catch(() => {});
  await input
    .dispatch({
      type: "thread.archive",
      commandId: CommandId.make(`t3team-wf:author:archive:${input.newId()}`),
      threadId,
    })
    .catch(() => {});
}
