/**
 * Which ended run the user may continue with one click (`message.dispatch`
 * with `manualContinuationOfRunId`). The continuation is a NEW run seeded with
 * "Continue where you left off." — it never resumes the old stream — so any
 * run that stopped without the user meaning it to qualifies:
 * - interrupted runs — including a Stop the provider never acknowledged, which
 *   the watchdog settles `interrupted` precisely so it stays resumable — and
 *   every failed run (usage limits, transient gateway errors and ordinary
 *   provider/turn failures alike);
 * - never a cancelled or completed run, nor an older run that recorded that
 *   unacknowledged Stop as `failed` (`interrupt_no_terminal`, written before
 *   the Stop backstop settled it `interrupted`): it reads as a failure, and a
 *   one-click "retry" banner must not undo a stop.
 *
 * The server's dispatch check and the web retry banner share this rule so the
 * banner is offered exactly when the server will accept it.
 */
import type { OrchestrationV2Run, OrchestrationV2TurnItem } from "@t3tools/contracts";

import { latestRootProviderFailure } from "./orchestrationV2ThreadError.ts";

const STOPPED_BY_USER_CODES: ReadonlySet<string> = new Set(["interrupt_no_terminal"]);

export function isManuallyContinuableRun(
  run: OrchestrationV2Run | null,
  turnItems: ReadonlyArray<OrchestrationV2TurnItem>,
): boolean {
  if (run === null) return false;
  if (run.status === "interrupted") return true;
  if (run.status !== "failed") return false;
  const code = latestRootProviderFailure(run, turnItems)?.code ?? null;
  return code === null || !STOPPED_BY_USER_CODES.has(code);
}
