import {
  RemoteEnvironmentAuthFetchError,
  RemoteEnvironmentAuthTimeoutError,
  RemoteEnvironmentAuthUndeclaredStatusError,
} from "@t3tools/client-runtime/rpc";
import { describe, expect, it } from "vite-plus/test";

import { isTransientT3TeamOutboxError } from "~/t3team/outbox/t3team-outboxModel";
import {
  EnvironmentNotConnectedError,
  toEnvironmentRequestError,
} from "./t3team-environmentTransientError";

/** What the outbox sees: the environment backend's error, classified by the outbox. */
const transient = (cause: unknown) =>
  isTransientT3TeamOutboxError(toEnvironmentRequestError(cause));

describe("environment request failures, as the offline outbox classifies them", () => {
  it("retries a missing connection, a failed fetch and a timeout", () => {
    expect(isTransientT3TeamOutboxError(new EnvironmentNotConnectedError())).toBe(true);
    expect(
      transient(
        new RemoteEnvironmentAuthFetchError({
          message:
            "Failed to fetch remote environment endpoint https://x/api/t3team/thread/workflow/resolve-input (TypeError: Failed to fetch).",
          cause: new TypeError("Failed to fetch"),
        }),
      ),
    ).toBe(true);
    expect(
      transient(
        new RemoteEnvironmentAuthTimeoutError(
          "https://x/api/t3team/thread/workflow/resolve-input",
          15_000,
        ),
      ),
    ).toBe(true);
  });

  it("does not retry what the environment answered or refused", () => {
    // A server refusal arrives as the route's own error text (see unwrapResponse).
    expect(
      transient(new Error("This decision is no longer pending — the workflow has moved on.")),
    ).toBe(false);
    expect(
      transient(
        new RemoteEnvironmentAuthFetchError({
          message: "The environment rejected the renewed session authorization.",
          cause: null,
        }),
      ),
    ).toBe(false);
    expect(
      transient(new RemoteEnvironmentAuthUndeclaredStatusError("https://x/api/t3team/y", 502)),
    ).toBe(false);
  });
});
