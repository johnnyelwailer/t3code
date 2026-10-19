import { assert, describe, it } from "@effect/vitest";
import { MessageId, RunId } from "@t3tools/contracts";

import { classifyTransientRunFailure } from "./orchestration-v2/t3team-transientRunFailure.ts";
import { planTransientRetry } from "./t3team-threadTransientTurnRetryPlan.ts";
import { maxTransientRetries } from "./t3team-threadTransientTurnRetryPolicy.ts";

const run = (ordinal: number, userMessageId = `user:${ordinal}`) => ({
  id: RunId.make(`run:${ordinal}`),
  ordinal,
  userMessageId: MessageId.make(userMessageId),
});

describe("unreachable provider is treated as an outage", () => {
  it("classifies a never-reachable provider as an unreachable outage", () => {
    const failure = classifyTransientRunFailure({
      class: "transport_error",
      code: null,
      message: "Provider endpoint was never reachable: connect ECONNREFUSED 127.0.0.1:443",
      retryable: null,
    });
    assert.deepEqual(failure, {
      message: "Provider endpoint was never reachable: connect ECONNREFUSED 127.0.0.1:443",
      directiveSeconds: null,
      outage: true,
      unreachable: true,
    });
  });

  it("does not mark an ordinary stall as unreachable", () => {
    const failure = classifyTransientRunFailure({
      class: "transport_error",
      code: "turn_inactivity",
      message: "Turn stalled: no provider stream activity for 600 seconds.",
      retryable: null,
    });
    assert.isUndefined(failure?.unreachable);
  });

  it("says so once and skips the 15-60s restart ladder", () => {
    const failure = {
      message: "Provider endpoint was never reachable",
      directiveSeconds: null,
      outage: true,
      unreachable: true,
    };
    assert.equal(maxTransientRetries(true, true), 0);
    const delays: Array<number> = [];
    const plan = planTransientRetry({
      runs: [run(1)],
      failedRunId: RunId.make("run:1"),
      failure,
      delayMs: (attempt) => {
        delays.push(attempt);
        return 15_000;
      },
    });
    assert.equal(plan.kind, "exhausted");
    assert.match(plan.note, /Provider unreachable, treating it as an outage/);
    assert.deepEqual(delays, []);
  });
});
