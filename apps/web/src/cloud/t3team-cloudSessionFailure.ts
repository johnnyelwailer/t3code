import type { CloudSessionFailedError, CloudSessionFailureReason } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type * as Cause from "effect/Cause";

import { toastManager } from "~/components/ui/toast";

import { cloudSessionFailureDescription } from "./t3team-cloudSessionToast";

/** The title for a create failure nothing more specific is known about. */
export const CLOUD_SESSION_CREATE_FAILED_TITLE = "Could not start a cloud session.";

/**
 * Short, actionable titles for the create failures whose remedy is known. The
 * server's message still rides along as the description, so the title only
 * has to say what to do next.
 */
const CREATE_FAILURE_HINTS: Partial<Record<CloudSessionFailureReason, string>> = {
  connect_sign_in_required: "Sign in to T3 Connect first.",
  connect_sign_in_pending: "Finish the T3 Connect sign-in in your browser.",
  unauthorized: "Sign in to the GitHub CLI for the cloud session host.",
  payload_issue_failed: "Could not hand the session its credential — try again.",
};

// A cloud-session create failure arrives over WS RPC, so on the client it may
// be a plain object rather than a class instance. Narrow structurally on the
// tag (the codebase convention for cross-RPC errors) instead of `instanceof`.
const isCloudSessionFailed = (failure: unknown): failure is CloudSessionFailedError =>
  typeof failure === "object" &&
  failure !== null &&
  (failure as { _tag?: unknown })._tag === "CloudSessionFailedError";

/**
 * The toast for a failed cloud-session create: a remedy-first title for known
 * reasons, the server's user-safe message (or a transport error's own message)
 * as the description, and the generic title for anything unrecognised.
 */
export function cloudSessionCreateFailureToast(result: { readonly cause: Cause.Cause<unknown> }): {
  readonly title: string;
  readonly description: string;
} {
  const failure = squashAtomCommandFailure(result);
  if (!isCloudSessionFailed(failure) || failure.message.trim() === "") {
    return {
      title: CLOUD_SESSION_CREATE_FAILED_TITLE,
      description: cloudSessionFailureDescription(result),
    };
  }
  return {
    title: CREATE_FAILURE_HINTS[failure.reason] ?? CLOUD_SESSION_CREATE_FAILED_TITLE,
    description: failure.message,
  };
}

export function reportCloudSessionCreateFailure(result: { readonly cause: Cause.Cause<unknown> }) {
  toastManager.add({ type: "error", ...cloudSessionCreateFailureToast(result) });
}
