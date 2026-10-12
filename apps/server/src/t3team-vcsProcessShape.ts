import type { VcsError } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";

import type { SourceControlRateLimitPausedError } from "./sourceControl/SourceControlRateLimit.ts";
import type { VcsProcessInput, VcsProcessOutput } from "./vcs/VcsProcess.ts";

/**
 * What the legacy GitHub routes need from a process runner. A guarded runner may also refuse a
 * `gh api` call outright while its host is rate-limit paused; the real `VcsProcess` never does.
 */
export type VcsProcessShape = {
  readonly run: (
    input: VcsProcessInput,
  ) => Effect.Effect<VcsProcessOutput, VcsError | SourceControlRateLimitPausedError>;
};
export type { VcsProcessOutput } from "./vcs/VcsProcess.ts";
