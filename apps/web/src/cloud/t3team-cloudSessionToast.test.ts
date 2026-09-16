import {
  AuthRelayWriteScope,
  CloudSessionFailedError,
  EnvironmentAuthorizationError,
} from "@t3tools/contracts";
import { EnvironmentRpcUnavailableError } from "@t3tools/client-runtime/rpc";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";

import { describe, expect, it } from "vite-plus/test";

import { cloudSessionFailureDescription } from "./t3team-cloudSessionToast";

const failure = (error: unknown) => AsyncResult.failure(Cause.fail(error));

describe("cloudSessionFailureDescription", () => {
  it("surfaces the server's user-facing message for each known reason", () => {
    const cases = [
      ["not_configured", "The GitHub CLI is not installed, so cloud sessions cannot be started."],
      ["unauthorized", "The GitHub CLI is not signed in to the cloud session host."],
      ["rejected", "The provider is rate limiting cloud session requests. Try again shortly."],
      ["unreachable", "The cloud session host could not be reached."],
      ["unknown_session", "That session cannot be cancelled yet."],
    ] as const;
    for (const [reason, message] of cases) {
      expect(
        cloudSessionFailureDescription(failure(new CloudSessionFailedError({ reason, message }))),
      ).toBe(message);
    }
  });

  it("surfaces transport-level failure messages", () => {
    expect(
      cloudSessionFailureDescription(
        failure(
          new EnvironmentRpcUnavailableError({
            environmentId: "env-1",
            message: "Cloud environment is not connected.",
          }),
        ),
      ),
    ).toBe("Cloud environment is not connected.");
    expect(
      cloudSessionFailureDescription(
        failure(
          new EnvironmentAuthorizationError({
            message: "This client is missing the relay:write scope.",
            requiredScope: AuthRelayWriteScope,
          }),
        ),
      ),
    ).toBe("This client is missing the relay:write scope.");
  });

  it("falls back to a generic line when nothing readable is present", () => {
    // Interrupts fall back; a string defect has no readable Error message.
    expect(cloudSessionFailureDescription(AsyncResult.failure(Cause.interrupt()))).toBe(
      "Unknown error.",
    );
    expect(cloudSessionFailureDescription(AsyncResult.failure(Cause.die("boom")))).toBe(
      "Unknown error.",
    );
    expect(cloudSessionFailureDescription(failure(new Error("   ")))).toBe("Unknown error.");
  });

  it("never surfaces an Error-typed defect's message", () => {
    // A defect can be an Error whose message carries wire internals (protocol
    // method names, token-bearing URLs). The hasDies guard must mask it.
    const leaky = new TypeError("fetch failed: wss://internal.corp/ws?token=sekrit");
    expect(cloudSessionFailureDescription(AsyncResult.failure(Cause.die(leaky)))).toBe(
      "Unknown error.",
    );
  });
});
