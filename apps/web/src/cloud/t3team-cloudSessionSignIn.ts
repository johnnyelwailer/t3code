import type { ToolAuthState } from "@t3tools/contracts";
import { create } from "zustand";

/**
 * A cloud-session action that stopped because the GitHub CLI is not signed in to a host it
 * needs (the session host, or the project's repository host). Instead of an error toast, the app
 * runs the gh device sign-in itself (`CloudSessionSignInDialogHost`) and repeats the action once
 * gh reports connected.
 */
type CloudSessionSignInRequest = {
  /**
   * The host the failed request needs, from the failure itself. Absent only when the server did
   * not say, which signs in to the deployment's default host.
   */
  readonly host?: string | undefined;
  /** Runs every action that failed for this host again, after the sign-in completed. */
  readonly retry: () => void;
  /** The actions `retry` runs; a second one for the same host joins it. */
  readonly retries: Array<() => void>;
};

type CloudSessionSignInStore = {
  readonly request: CloudSessionSignInRequest | null;
};

export const useCloudSessionSignInStore = create<CloudSessionSignInStore>(() => ({
  request: null,
}));

/**
 * Start the gh sign-in for `host`; `retry` runs once it succeeds. While a sign-in for the same
 * host is open, another action for it joins that one (same request object, so the running
 * sign-in is not restarted) and both run after it. One for a different host is refused (`false`):
 * replacing the open request would drop the first action, so the caller reports it instead.
 */
export function requestCloudSessionSignIn(retry: () => void, host?: string): boolean {
  const open = useCloudSessionSignInStore.getState().request;
  if (open !== null) {
    if (open.host !== host) return false;
    open.retries.push(retry);
    return true;
  }
  const retries = [retry];
  useCloudSessionSignInStore.setState({
    request: { host, retries, retry: () => retries.forEach((run) => run()) },
  });
  return true;
}

/**
 * Whether a gh state is about the host the request needs. gh's status belongs to one host: a
 * `connected` for another host, or one that names no host, says nothing about this one. A request
 * that names no host is for the default host, which any state speaks for.
 */
export function toolAuthStateIsForHost(
  state: Pick<ToolAuthState, "hostname"> | undefined,
  host: string | undefined,
): boolean {
  return host === undefined || state?.hostname === host;
}

export function clearCloudSessionSignIn() {
  useCloudSessionSignInStore.setState({ request: null });
}
