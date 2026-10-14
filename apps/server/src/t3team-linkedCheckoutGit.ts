/**
 * The one way the linked-checkout modules run git: no tty (a credential prompt would hang until
 * the timeout, so git fails instead), bounded output, and non-zero exits returned, not thrown.
 *
 * @module t3team-linkedCheckoutGit
 */
import * as Effect from "effect/Effect";

import { VcsProcess } from "./vcs/VcsProcess.ts";

/** Generous: a first clone of a large repository legitimately takes many minutes. */
export const LINKED_REPOSITORY_CLONE_TIMEOUT_MS = 30 * 60_000;
export const LINKED_REPOSITORY_FETCH_TIMEOUT_MS = 10 * 60_000;
export const INSPECT_TIMEOUT_MS = 2 * 60_000;

export const linkedCheckoutGit = Effect.fn("linkedCheckoutGit")(function* (
  operation: string,
  cwd: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
  /** Replaces the default env (a no-prompt one), e.g. the clone's own for a remote read. */
  env: Readonly<Record<string, string>> = { GIT_TERMINAL_PROMPT: "0" },
) {
  const vcs = yield* VcsProcess;
  return yield* vcs.run({
    operation: `t3team.referenceRepository.${operation}`,
    command: "git",
    args,
    cwd,
    allowNonZeroExit: true,
    timeoutMs,
    maxOutputBytes: 64 * 1024,
    env,
  });
});
