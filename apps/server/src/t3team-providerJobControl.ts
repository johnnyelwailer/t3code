/**
 * Out-of-band background-job control for one app thread.
 *
 * Resolves the thread's active provider thread, then its LIVE provider session
 * (`ProviderSessionManagerV2.get` never opens or recovers one: a dead
 * session's job registry died with it), and forwards to the runtime's
 * optional `jobControl`. A runtime without the method is "unsupported" — a
 * capability answer, not a failure.
 *
 * @module t3team-providerJobControl
 */
import type { ProviderJobControlInput, ProviderJobControlResult } from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ProviderSessionManagerV2 } from "./orchestration-v2/ProviderSessionManager.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { ProviderJobControlUnsupportedError } from "./provider/Errors.ts";

/** The thread has no live provider session, so it has no live jobs either. */
class ProviderJobControlNoSessionError extends Data.TaggedError(
  "ProviderJobControlNoSessionError",
)<{ readonly threadId: string }> {}

export const controlThreadJobs = Effect.fn("t3team.controlThreadJobs")(function* (
  input: ProviderJobControlInput,
) {
  const threads = yield* ThreadManagementService;
  const sessions = yield* ProviderSessionManagerV2;
  const records = yield* threads.getThreadRecords(input.threadId, ["providerThreads"]);
  const providerThread = records.providerThreads.find(
    (candidate) => candidate.id === records.thread.activeProviderThreadId,
  );
  const providerSessionId = providerThread?.providerSessionId;
  if (providerThread === undefined || providerSessionId == null) {
    return yield* new ProviderJobControlNoSessionError({ threadId: input.threadId });
  }
  const runtime = yield* sessions.get(providerSessionId);
  if (Option.isNone(runtime)) {
    return yield* new ProviderJobControlNoSessionError({ threadId: input.threadId });
  }
  const jobControl = runtime.value.jobControl;
  if (jobControl === undefined) {
    return yield* new ProviderJobControlUnsupportedError({ threadId: input.threadId });
  }
  const result: ProviderJobControlResult = yield* jobControl({
    providerThread,
    request: input.request,
  });
  return result;
});
