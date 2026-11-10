/**
 * How loudly a provider status should speak.
 *
 * The banner treated every non-ready status as a failure of the provider, in destructive red with
 * `role="alert"`. But a STATUS-CHECK TIMEOUT is not a failure of anything the user is doing — it means we
 * could not ask the provider how it was, and the live case that surfaced this had a turn streaming happily on
 * another instance while the banner shouted that Codex was broken.
 *
 * The classification is read from the data, not from the message text:
 *
 * - `unauthenticated` — real and actionable ("sign in via the CLI"). Destructive.
 * - `error` with auth `unknown` — we do not even know the auth state, so the PROBE failed rather than the
 *   provider. Informational.
 * - `error` with a known auth state — the provider genuinely answered badly. Destructive.
 * - `warning` — limited availability. Warning, unchanged.
 *
 * "We could not determine the auth state" is the honest signal for a failed probe: a provider that actually
 * answered always reports one.
 */

import type { ServerProvider } from "@t3tools/contracts";

export type T3TeamProviderStatusSeverity = "info" | "warning" | "error";

export function classifyT3TeamProviderStatusSeverity(
  status: Pick<ServerProvider, "status" | "auth">,
): T3TeamProviderStatusSeverity {
  if (status.status === "warning") return "warning";
  if (status.auth.status === "unauthenticated") return "error";
  // An unknown auth state means the probe never got an answer to classify.
  return status.auth.status === "unknown" ? "info" : "error";
}

/**
 * On a cloud session, provider readiness runs after the machine is up: install, then sign-in, then the
 * queued message. Not installed, not signed in, an unanswered probe or a disabled instance are states
 * that flow resolves, so they never raise a banner; only a provider that answered with an error does.
 */
function isCloudReadinessState(status: Pick<ServerProvider, "status" | "auth" | "installed">) {
  return (
    status.installed === false ||
    status.status === "disabled" ||
    status.auth.status === "unauthenticated" ||
    status.auth.status === "unknown"
  );
}

/**
 * Whether an informational status is worth interrupting for while work is visibly succeeding elsewhere.
 *
 * A probe that timed out on one instance says nothing about the instance currently streaming a turn, and the
 * user can see that turn working. Real errors are never suppressed — they stay on screen regardless.
 */
export function shouldSuppressT3TeamProviderStatus(input: {
  readonly status: Pick<ServerProvider, "status" | "auth" | "instanceId" | "installed"> | null;
  readonly isTurnInProgress: boolean;
  readonly activeTurnInstanceId?: string | undefined;
  /** The thread runs on another machine (a cloud session or peer), not this desktop. */
  readonly onRemoteEnvironment?: boolean;
}): boolean {
  if (!input.status) return false;
  if (input.onRemoteEnvironment === true && isCloudReadinessState(input.status)) return true;
  if (!input.isTurnInProgress) return false;
  if (classifyT3TeamProviderStatusSeverity(input.status) !== "info") return false;
  return (
    input.activeTurnInstanceId !== undefined &&
    input.activeTurnInstanceId !== input.status.instanceId
  );
}
