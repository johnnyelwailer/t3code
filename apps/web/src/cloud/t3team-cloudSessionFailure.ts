import type {
  CloudSession,
  CloudSessionFailedError,
  CloudSessionFailureReason,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type * as Cause from "effect/Cause";

import { toastManager } from "~/components/ui/toast";

import { cloudSessionFailureDescription } from "./t3team-cloudSessionFailureDescription";
import { offerCloudSessionSignIn } from "./t3team-cloudSessionSignIn";

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
  broker_sign_in_required: "Sign in first: the account entry at the bottom of Settings.",
  broker_unavailable: "The Nexi cloud-session service is not reachable right now.",
  machine_unavailable: "This project's machine cannot start yet.",
  repository_sign_in_required: "Sign in to the GitHub CLI for the project's repository host.",
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

/**
 * One line for the setup card: the remedy when we have one, otherwise the description.
 * The card already titles the failure itself ("Setup didn't finish").
 */
export function cloudSessionCreateFailureInline(result: {
  readonly cause: Cause.Cause<unknown>;
}): string {
  const { title, description } = cloudSessionCreateFailureToast(result);
  if (title === CLOUD_SESSION_CREATE_FAILED_TITLE) return description;
  return title;
}

/** The typed reason and GitHub host, when the create failed as a `CloudSessionFailedError`. */
export function cloudSessionCreateFailureFacts(result: { readonly cause: Cause.Cause<unknown> }): {
  readonly reason?: string;
  readonly host?: string;
} {
  const failure = squashAtomCommandFailure(result);
  if (!isCloudSessionFailed(failure)) return {};
  return {
    ...(failure.reason === undefined ? {} : { reason: failure.reason }),
    ...(typeof failure.host === "string" && failure.host !== "" ? { host: failure.host } : {}),
  };
}

const SIGN_IN_REASONS: ReadonlySet<string> = new Set([
  "broker_sign_in_required",
  "connect_sign_in_required",
  "unauthorized",
  "repository_sign_in_required",
]);

/** True when the next step is for the user to sign in, so the card can offer a Sign-in action. */
export function isCloudSessionSignInFailure(reason: string | null | undefined): boolean {
  return reason != null && SIGN_IN_REASONS.has(reason);
}

/**
 * A create that failed only because gh is not signed in to a host it needs does not end in a
 * toast and does not open a dialog: the setup card (or an inline CTA) offers Sign in for THAT
 * host, and the dialog opens only when the user clicks it (InvNoAutoDialog). Anything else is a
 * toast, as is a sign-in for another host while one is already open.
 */
export function reportCloudSessionCreateFailure(
  result: { readonly cause: Cause.Cause<unknown> },
  retry: () => void,
  /** Repeats the create as a plain session in the project, which the failure may offer. */
  retryPlain?: () => void,
) {
  const failure = squashAtomCommandFailure(result);
  if (isCloudSessionFailed(failure) && failure.plainAvailable === true && retryPlain) {
    const id = toastManager.add({
      type: "error",
      ...cloudSessionCreateFailureToast(result),
      actionProps: {
        children: "Start a plain session",
        onClick: () => {
          toastManager.close(id);
          retryPlain();
        },
      },
    });
    return;
  }
  if (
    isCloudSessionFailed(failure) &&
    (failure.reason === "unauthorized" || failure.reason === "repository_sign_in_required")
  ) {
    if (offerCloudSessionSignIn(retry, failure.host)) return;
  }
  toastManager.add({ type: "error", ...cloudSessionCreateFailureToast(result) });
}

/** One line when a create went on as a plain session because the project's machine could not be used. */
export function reportCloudSessionMachineFallback(session: Pick<CloudSession, "machineFallback">) {
  if (session.machineFallback === undefined) return;
  toastManager.add({
    type: "info",
    title: "Started without the project's machine",
    description: session.machineFallback,
  });
}
