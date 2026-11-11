import { describe, expect, it } from "vite-plus/test";

import {
  toolAuthFailureCopy,
  toolAuthFailureText,
  type ToolAuthFailureKind,
} from "./t3team-toolAuthFailureMessage";
import {
  toolAuthFailureReasonFromError,
  toolAuthFailureReasonFromState,
} from "./t3team-toolAuthFailureFromError";

const CONTEXT = { label: "Claude Code", machine: "this cloud machine" } as const;

/**
 * Every reason the server's tool-auth, install and connect paths can report, plus the client-only
 * ones. A row here is the contract the card renders: plain words, the machine named where it
 * matters, a next step, and never the CLI's or npm's own text.
 */
const CASES: ReadonlyArray<{
  readonly reason: ToolAuthFailureKind;
  readonly message: string;
  readonly nextStep: string | undefined;
  readonly retryable: boolean;
}> = [
  {
    reason: "featureDisabled",
    message: "Claude Code sign-in isn't enabled on this cloud machine yet.",
    nextStep:
      "Turn on CLI tool sign-in for this cloud machine, or sign Claude Code in from its terminal.",
    retryable: false,
  },
  {
    reason: "notInstalled",
    message: "Claude Code isn't installed on this cloud machine.",
    nextStep: "Install and connect installs it for you.",
    retryable: true,
  },
  {
    reason: "installFailed",
    message: "Installing Claude Code on this cloud machine didn't finish.",
    nextStep: "Retry, or install it from the machine's terminal if it keeps failing.",
    retryable: true,
  },
  {
    reason: "installTimedOut",
    message: "Installing Claude Code on this cloud machine took too long and was stopped.",
    nextStep: "Retry when the machine is less busy.",
    retryable: true,
  },
  {
    reason: "signInFailed",
    message: "Claude Code did not accept the sign-in.",
    nextStep: "Retry and approve it in the browser, then paste the code back here.",
    retryable: true,
  },
  {
    reason: "credentialExpired",
    message: "Claude Code's sign-in on this cloud machine has expired.",
    nextStep: "Reconnect to sign in again.",
    retryable: true,
  },
  {
    reason: "noEnvironment",
    message: "This cloud machine isn't ready to run this yet.",
    nextStep: "Wait for the machine to come up, then try again.",
    retryable: true,
  },
  {
    reason: "noResponse",
    message: "This cloud machine hasn't answered the request to set up Claude Code.",
    nextStep: "Retry, or check the machine is still connected.",
    retryable: true,
  },
  {
    reason: "spawnFailed",
    message: "This cloud machine could not start Claude Code.",
    nextStep: "Retry, or sign in from the machine's terminal.",
    retryable: true,
  },
  {
    reason: "noActiveSession",
    message: "The Claude Code sign-in is no longer running.",
    nextStep: "Start it again.",
    retryable: true,
  },
  {
    reason: "notAwaitingCode",
    message: "Claude Code isn't waiting for a code right now.",
    nextStep: "Start the sign-in again and use the code it shows.",
    retryable: true,
  },
  {
    reason: "offline",
    message: "The connection to this cloud machine dropped.",
    nextStep: "Reconnect, then try again.",
    retryable: true,
  },
  {
    reason: "requestFailed",
    message: "This cloud machine could not set up Claude Code.",
    nextStep: undefined,
    retryable: true,
  },
];

describe("toolAuthFailureCopy", () => {
  it.each(CASES)("maps $reason to plain words with a next step", (expected) => {
    expect(toolAuthFailureCopy(expected.reason, CONTEXT)).toEqual({
      message: expected.message,
      retryable: expected.retryable,
      ...(expected.nextStep === undefined ? {} : { nextStep: expected.nextStep }),
    });
  });

  it("falls back to the generic request failure for a reason this client does not know", () => {
    expect(toolAuthFailureCopy("futureReason" as ToolAuthFailureKind, CONTEXT).message).toBe(
      "This cloud machine could not set up Claude Code.",
    );
  });

  it("joins the sentence and the next step for the card's single line", () => {
    expect(toolAuthFailureText("notInstalled", CONTEXT)).toBe(
      "Claude Code isn't installed on this cloud machine. Install and connect installs it for you.",
    );
  });
});

describe("classifying what came back", () => {
  it("reads a returned failed state, which is how the feature-gate refusal arrives", () => {
    expect(toolAuthFailureReasonFromState({ phase: "failed", reason: "featureDisabled" })).toBe(
      "featureDisabled",
    );
  });

  it("treats an expired phase as an expiry even from a server that sends no reason", () => {
    expect(toolAuthFailureReasonFromState({ phase: "expired" })).toBe("credentialExpired");
  });

  it("reports nothing for a state that is not a failure", () => {
    expect(toolAuthFailureReasonFromState({ phase: "installing" })).toBeNull();
    expect(toolAuthFailureReasonFromState(undefined)).toBeNull();
  });

  it("maps the tagged errors the RPC can fail with", () => {
    expect(toolAuthFailureReasonFromError({ _tag: "ToolAuthSpawnError" })).toBe("spawnFailed");
    expect(toolAuthFailureReasonFromError({ _tag: "ToolAuthNoActiveSessionError" })).toBe(
      "noActiveSession",
    );
    expect(toolAuthFailureReasonFromError({ _tag: "ToolAuthNotAwaitingCodeError" })).toBe(
      "notAwaitingCode",
    );
    expect(toolAuthFailureReasonFromError(new Error("boom"))).toBe("requestFailed");
  });
});
