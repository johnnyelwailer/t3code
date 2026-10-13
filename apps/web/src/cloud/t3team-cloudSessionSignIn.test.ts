import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { toastManager } from "~/components/ui/toast";

import { reportCloudSessionCreateFailure } from "./t3team-cloudSessionFailure";
import {
  clearCloudSessionSignIn,
  requestCloudSessionSignIn,
  toolAuthStateIsForHost,
  useCloudSessionSignInStore,
} from "./t3team-cloudSessionSignIn";

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

  it("signs in to the host the failure names, which can differ from the default login host", () => {
    const toast = vi.spyOn(toastManager, "add");
    reportCloudSessionCreateFailure(
      failure({
        _tag: "CloudSessionFailedError",
        reason: "unauthorized",
        message: "No usable credential.",
        host: "ghe.session-host.example",
      }),
      () => {},
    );
    expect(toast).not.toHaveBeenCalled();
    expect(useCloudSessionSignInStore.getState().request?.host).toBe("ghe.session-host.example");
  });

  it("opens the sign-in for the repository's host instead of a toast, and keeps the retry", () => {
    const toast = vi.spyOn(toastManager, "add");
    const retry = vi.fn();
    reportCloudSessionCreateFailure(
      failure({
        _tag: "CloudSessionFailedError",
        reason: "repository_sign_in_required",
        message: "Sign in to github.com with gh.",
        host: "github.com",
      }),
      retry,
    );
    expect(toast).not.toHaveBeenCalled();
    const request = useCloudSessionSignInStore.getState().request;
    expect(request?.host).toBe("github.com");
    request?.retry();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("runs every action that waited on the same host's sign-in, without restarting it", () => {
    const first = vi.fn();
    const second = vi.fn();
    expect(requestCloudSessionSignIn(first, "github.com")).toBe(true);
    const open = useCloudSessionSignInStore.getState().request;
    expect(requestCloudSessionSignIn(second, "github.com")).toBe(true);
    expect(useCloudSessionSignInStore.getState().request).toBe(open);
    open?.retry();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("keeps the open sign-in and toasts a failure that needs another host", () => {
    const toast = vi.spyOn(toastManager, "add");
    const first = vi.fn();
    requestCloudSessionSignIn(first, "github.com");
    reportCloudSessionCreateFailure(
      failure({
        _tag: "CloudSessionFailedError",
        reason: "unauthorized",
        message: "No usable credential.",
        host: "nexplore.ghe.com",
      }),
      () => {},
    );
    expect(toast).toHaveBeenCalledOnce();
    expect(useCloudSessionSignInStore.getState().request?.host).toBe("github.com");
    useCloudSessionSignInStore.getState().request?.retry();
    expect(first).toHaveBeenCalledOnce();
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

describe("toolAuthStateIsForHost", () => {
  it("does not take another host's gh state for the one the request needs", () => {
    expect(toolAuthStateIsForHost({ hostname: "nexplore.ghe.com" }, "github.com")).toBe(false);
    expect(toolAuthStateIsForHost({ hostname: "github.com" }, "github.com")).toBe(true);
  });

  it("needs an exact match once a host is requested: a state naming no host is not it", () => {
    expect(toolAuthStateIsForHost({}, "github.com")).toBe(false);
    expect(toolAuthStateIsForHost(undefined, "github.com")).toBe(false);
  });

  it("lets any state speak for a request that names no host (the default host)", () => {
    expect(toolAuthStateIsForHost({ hostname: "nexplore.ghe.com" }, undefined)).toBe(true);
    expect(toolAuthStateIsForHost(undefined, undefined)).toBe(true);
  });
});
