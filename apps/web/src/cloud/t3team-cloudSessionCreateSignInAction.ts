/**
 * The Sign-in recovery on a setup card (and the composer banner) when a cloud-session create
 * failed because the user is signed out. The action itself is supplied by the caller: Nexplore
 * and T3 Connect open Settings, gh runs the device flow. Never starts a sign-in on its own.
 */
import type { CloudQueuedSendRecoveryAction } from "./t3team-cloudProjectNotResolvedActions";
import { isCloudSessionSignInFailure } from "./t3team-cloudSessionFailure";

export function cloudSessionCreateSignInAction(input: {
  readonly createFailed?: boolean;
  readonly failureKind?: string;
  readonly failureReason?: string | null;
  readonly onSignIn: () => void;
}): CloudQueuedSendRecoveryAction | null {
  if (input.createFailed !== true && input.failureKind !== "create_failed") return null;
  if (!isCloudSessionSignInFailure(input.failureReason)) return null;
  return { id: "sign-in", label: "Sign in", onClick: input.onSignIn };
}
