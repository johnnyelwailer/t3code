import {
  OAUTH_SIGNIN_EXPIRED_MESSAGE,
  isAtlassianOAuthPopupClosedError,
  waitForOAuthCallback,
} from "~/t3team/hooks/t3team-atlassianOAuthPopup";
import { awaitManualAtlassianSignin } from "~/t3team/hooks/t3team-atlassianOAuthManualSignin";
import { readAtlassianOAuthCallbackParams } from "~/t3team/hooks/t3team-atlassianOAuthServerFlow";

export type AtlassianOAuthAttemptOutcome =
  /** The tab-owned flow won: this code still has to be exchanged with the verifier in this tab. */
  | { readonly kind: "code"; readonly code: string }
  /** The server-owned flow won: the account is already persisted, there is nothing left to exchange. */
  | { readonly kind: "server_connected" };

/**
 * Reads one callback URL and decides which of the two live flows it belongs to.
 *
 * A `state` that matches neither is the only case left that deserves the CSRF reading it always had.
 * A `state` matching the server flow is expected, not suspicious: it means the user opened the shared
 * link in this same browser, the callback page already handed the code to the server, and this tab
 * holds no verifier for it.
 */
function readAttemptOutcome(input: {
  readonly callbackUrl: string;
  readonly tabState: string;
  readonly serverState: string | null;
}): AtlassianOAuthAttemptOutcome {
  const params = readAtlassianOAuthCallbackParams(input.callbackUrl);

  if (params.error) {
    throw new Error(`OAuth error: ${params.error} ${params.errorDescription}`.trim());
  }
  if (input.serverState && params.state === input.serverState) {
    return { kind: "server_connected" };
  }
  if (params.state !== input.tabState) {
    throw new Error("OAuth state mismatch. Possible CSRF attack.");
  }
  if (!params.code) {
    throw new Error("No authorization code in callback.");
  }
  return { kind: "code", code: params.code };
}

/**
 * Waits out one sign-in attempt, through however it ends up being completed.
 *
 * The popup is only the first hope. If it is closed before sign-in finishes the attempt is not over —
 * the user still needs to sign in, and now they need a link to do it with. So the wait is re-armed
 * without a window handle, which is the same shape used when a popup was never allowed at all, and it
 * additionally watches for the server completing the flow from a browser this tab cannot see.
 *
 * `onNeedsManualOpen` fires when the caller should show that link. It can fire for either cause, and
 * the caller must treat it as a prompt rather than a failure.
 */
export async function runAtlassianOAuthAttempt(input: {
  readonly popup: WindowProxy | null;
  readonly redirectUri: string;
  readonly tabState: string;
  readonly serverState: string | null;
  readonly listAccountIds: () => Promise<ReadonlyArray<string>>;
  readonly baselineAccountIds: Promise<ReadonlyArray<string>>;
  readonly onNeedsManualOpen: () => void;
}): Promise<AtlassianOAuthAttemptOutcome> {
  const readOutcome = (callbackUrl: string) =>
    readAttemptOutcome({
      callbackUrl,
      tabState: input.tabState,
      serverState: input.serverState,
    });

  try {
    return readOutcome(await waitForOAuthCallback(input.popup, input.redirectUri));
  } catch (error) {
    if (!isAtlassianOAuthPopupClosedError(error)) throw error;
  }

  input.onNeedsManualOpen();
  const outcome = await awaitManualAtlassianSignin({
    redirectUri: input.redirectUri,
    listAccountIds: input.listAccountIds,
    baselineAccountIds: await input.baselineAccountIds,
  });

  if (outcome.kind === "server_connected") return { kind: "server_connected" };
  if (outcome.kind === "timed_out") throw new Error(OAUTH_SIGNIN_EXPIRED_MESSAGE);
  return readOutcome(outcome.href);
}
