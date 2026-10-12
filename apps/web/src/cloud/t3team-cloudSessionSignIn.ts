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
  /** Runs the action that failed again, after the sign-in completed. */
  readonly retry: () => void;
};

type CloudSessionSignInStore = {
  readonly request: CloudSessionSignInRequest | null;
};

export const useCloudSessionSignInStore = create<CloudSessionSignInStore>(() => ({
  request: null,
}));

/** Start the gh sign-in for `host`; `retry` runs once it succeeds. */
export function requestCloudSessionSignIn(retry: () => void, host?: string) {
  useCloudSessionSignInStore.setState({ request: { retry, host } });
}

/**
 * Whether a gh state is about the host the request needs. gh's status belongs to one host: a
 * `connected` for another host says nothing about this one. A state or request that names no host
 * is the default host on both sides.
 */
export function toolAuthStateIsForHost(
  state: Pick<ToolAuthState, "hostname"> | undefined,
  host: string | undefined,
): boolean {
  return host === undefined || state?.hostname === undefined || state.hostname === host;
}

export function clearCloudSessionSignIn() {
  useCloudSessionSignInStore.setState({ request: null });
}
