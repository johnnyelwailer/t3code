import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";

import { describe, expect, it } from "vite-plus/test";

import {
  CLOUD_SESSION_CREATE_FAILED_TITLE,
  cloudSessionCreateFailureToast,
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
