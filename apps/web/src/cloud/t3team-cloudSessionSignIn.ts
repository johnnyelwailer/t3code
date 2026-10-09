import { create } from "zustand";

/**
 * A cloud-session action that stopped because the GitHub CLI is not signed in to the session
 * host. Instead of an error toast, the app runs the gh device sign-in itself
 * (`CloudSessionSignInDialogHost`) and repeats the action once gh reports connected.
 */
type CloudSessionSignInRequest = {
  /** Runs the action that failed again, after the sign-in completed. */
  readonly retry: () => void;
};

type CloudSessionSignInStore = {
  readonly request: CloudSessionSignInRequest | null;
};

export const useCloudSessionSignInStore = create<CloudSessionSignInStore>(() => ({
  request: null,
}));

/** Start the gh sign-in for the session host; `retry` runs once it succeeds. */
export function requestCloudSessionSignIn(retry: () => void) {
  useCloudSessionSignInStore.setState({ request: { retry } });
}

export function clearCloudSessionSignIn() {
  useCloudSessionSignInStore.setState({ request: null });
}
