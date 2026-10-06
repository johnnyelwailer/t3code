import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { toastManager } from "~/components/ui/toast";

import { reportCloudSessionCreateFailure } from "./t3team-cloudSessionFailure";
import { clearCloudSessionSignIn, useCloudSessionSignInStore } from "./t3team-cloudSessionSignIn";

const failure = (error: unknown) => AsyncResult.failure(Cause.fail(error));

afterEach(() => {
  clearCloudSessionSignIn();
  vi.restoreAllMocks();
});

describe("reportCloudSessionCreateFailure", () => {
  it("starts the gh sign-in instead of an error when gh is not signed in, and keeps the retry", () => {
    const toast = vi.spyOn(toastManager, "add");
    const retry = vi.fn();
    reportCloudSessionCreateFailure(
      // Over RPC the error arrives as a plain tagged object.
      failure({
        _tag: "CloudSessionFailedError",
        reason: "unauthorized",
        message: "The GitHub CLI is not signed in to the cloud session host.",
      }),
      retry,
    );
    expect(toast).not.toHaveBeenCalled();
    useCloudSessionSignInStore.getState().request?.retry();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("still toasts every other failure", () => {
    const toast = vi.spyOn(toastManager, "add");
    reportCloudSessionCreateFailure(
      failure(new CloudSessionFailedError({ reason: "rejected", message: "Rate limited." })),
      () => {},
    );
    expect(toast).toHaveBeenCalledOnce();
    expect(useCloudSessionSignInStore.getState().request).toBeNull();
  });
});
