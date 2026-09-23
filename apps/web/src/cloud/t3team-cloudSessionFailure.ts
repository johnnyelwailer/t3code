import { CloudSessionFailedError } from "@t3tools/contracts";

import { toastManager } from "~/components/ui/toast";

// A cloud-session create failure arrives over WS RPC, so on the client it may
// be a plain object rather than a class instance. Narrow structurally on the
// tag (the codebase convention for cross-RPC errors) instead of `instanceof`.
const isCloudSessionFailed = (failure: unknown): failure is CloudSessionFailedError =>
  typeof failure === "object" &&
  failure !== null &&
  (failure as { _tag?: unknown })._tag === "CloudSessionFailedError";

/**
 * Present a failed cloud-session create. The server's `CloudSessionFailedError`
 * carries user-safe copy — most notably `connect_sign_in_pending`, whose message
 * tells the user to confirm the in-browser sign-in the create just started.
 */
export function reportCloudSessionCreateFailure(failure: unknown) {
  toastManager.add({
    type: "error",
    title: "Could not start a cloud session.",
    ...(isCloudSessionFailed(failure) ? { description: failure.message } : {}),
  });
}
