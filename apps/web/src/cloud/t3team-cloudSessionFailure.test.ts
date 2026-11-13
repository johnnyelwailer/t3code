import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";

import { describe, expect, it } from "vite-plus/test";

import {
  CLOUD_SESSION_CREATE_FAILED_TITLE,
  cloudSessionCreateFailureFacts,
  cloudSessionCreateFailureInline,
  cloudSessionCreateFailureToast,
  isCloudSessionSignInFailure,
} from "./t3team-cloudSessionFailure";

const failure = (error: unknown) => AsyncResult.failure(Cause.fail(error));

describe("cloudSessionCreateFailureToast", () => {
  it("leads with the remedy and keeps the server's message for a sign-in failure", () => {
    const message = "Sign in to T3 Connect on this machine to start a cloud session.";
    expect(
      cloudSessionCreateFailureToast(
        failure(new CloudSessionFailedError({ reason: "connect_sign_in_required", message })),
      ),
    ).toEqual({ title: "Sign in to T3 Connect first.", description: message });
  });

  it("still surfaces the message over RPC, where the error is a plain tagged object", () => {
    const toast = cloudSessionCreateFailureToast(
      failure({
        _tag: "CloudSessionFailedError",
        reason: "connect_sign_in_pending",
        message: "Confirm it in the browser.",
      }),
    );
    expect(toast).toEqual({
      title: "Finish the T3 Connect sign-in in your browser.",
      description: "Confirm it in the browser.",
    });
  });

  it("keeps the generic title, with the message, for a reason without a hint", () => {
    const message = "The cloud session host could not be reached.";
    expect(
      cloudSessionCreateFailureToast(
        failure(new CloudSessionFailedError({ reason: "unreachable", message })),
      ),
    ).toEqual({ title: CLOUD_SESSION_CREATE_FAILED_TITLE, description: message });
  });

  it("falls back to the generic title for an unknown failure", () => {
    expect(cloudSessionCreateFailureToast(AsyncResult.failure(Cause.die("boom")))).toEqual({
      title: CLOUD_SESSION_CREATE_FAILED_TITLE,
      description: "Unknown error.",
    });
  });
});

describe("cloudSessionCreateFailureInline", () => {
  it("uses the remedy as the card's one line, and the description when there is no hint", () => {
    expect(
      cloudSessionCreateFailureInline(
        failure(
          new CloudSessionFailedError({
            reason: "broker_sign_in_required",
            message: "The Nexplore account is not signed in.",
          }),
        ),
      ),
    ).toBe("Sign in first: the account entry at the bottom of Settings.");
    const message = "The cloud session host could not be reached.";
    expect(
      cloudSessionCreateFailureInline(
        failure(new CloudSessionFailedError({ reason: "unreachable", message })),
      ),
    ).toBe(message);
  });
});

describe("cloudSessionCreateFailureFacts", () => {
  it("returns the reason and host of a tagged create failure", () => {
    expect(
      cloudSessionCreateFailureFacts(
        failure(
          new CloudSessionFailedError({
            reason: "unauthorized",
            message: "gh is not signed in.",
            host: "github.com",
          }),
        ),
      ),
    ).toEqual({ reason: "unauthorized", host: "github.com" });
    expect(cloudSessionCreateFailureFacts(AsyncResult.failure(Cause.die("boom")))).toEqual({});
  });
});

describe("isCloudSessionSignInFailure", () => {
  it("is true only for the reasons whose next step is a sign-in", () => {
    expect(isCloudSessionSignInFailure("broker_sign_in_required")).toBe(true);
    expect(isCloudSessionSignInFailure("unauthorized")).toBe(true);
    expect(isCloudSessionSignInFailure("broker_unavailable")).toBe(false);
    expect(isCloudSessionSignInFailure(undefined)).toBe(false);
  });
});
