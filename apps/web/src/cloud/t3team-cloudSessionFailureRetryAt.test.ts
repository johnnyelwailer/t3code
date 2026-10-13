import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { cloudSessionFailureRetryAt } from "./t3team-cloudSessionFailureRetryAt";

const failure = (error: unknown) => AsyncResult.failure(Cause.fail(error));

describe("cloudSessionFailureRetryAt", () => {
  it("reads retryAt from a rate-limited CloudSessionFailedError", () => {
    expect(
      cloudSessionFailureRetryAt(
        failure(
          new CloudSessionFailedError({
            reason: "rejected",
            message: "The provider is rate limiting cloud session requests. Try again shortly.",
            retryAt: 1_700_000_000_000,
          }),
        ),
      ),
    ).toBe(1_700_000_000_000);
  });

  it("returns null when the failure carries no pause window", () => {
    expect(
      cloudSessionFailureRetryAt(
        failure(
          new CloudSessionFailedError({
            reason: "unreachable",
            message: "The cloud session host could not be reached.",
          }),
        ),
      ),
    ).toBeNull();
  });
});
