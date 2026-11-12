import type { ToolAuthState } from "@t3tools/contracts";
import { create } from "zustand";

/**
 * GitHub sign-in needed: record an offer, not an open dialog.
 * The dialog opens only when the user accepts (InvNoAutoDialog).
 */
export type CloudSessionSignInRequest = {
  readonly host?: string | undefined;
  readonly retry: () => void;
  readonly retries: Array<() => void>;
};

type CloudSessionSignInStore = {
  /** Opens the dialog. Set only from a user action (acceptCloudSessionSignInOffer). */
  readonly request: CloudSessionSignInRequest | null;
  /** Inline CTA; does not open the dialog. */
  readonly offer: CloudSessionSignInRequest | null;
};

export const useCloudSessionSignInStore = create<CloudSessionSignInStore>(() => ({
  request: null,
  offer: null,
}));

function joinOrStart(
  slot: "request" | "offer",
  retry: () => void,
  host: string | undefined,
): boolean {
  const state = useCloudSessionSignInStore.getState();
  const open = state[slot];
  if (open !== null) {
    if (open.host !== host) return false;
    open.retries.push(retry);
    return true;
  }
  // A dialog already open for this host takes the retry; a different host is refused.
  if (slot === "offer" && state.request !== null) {
    if (state.request.host !== host) return false;
    state.request.retries.push(retry);
    return true;
  }
  const retries = [retry];
  useCloudSessionSignInStore.setState({
    [slot]: { host, retries, retry: () => retries.forEach((run) => run()) },
  });
  return true;
}

/** Record a Sign-in CTA. Does not open the dialog. */
export function offerCloudSessionSignIn(retry: () => void, host?: string): boolean {
  return joinOrStart("offer", retry, host);
}

/**
 * Open the gh sign-in dialog for `host` and run `retry` once it succeeds.
 * Call only from a user action (the Sign-in button).
 */
export function requestCloudSessionSignIn(retry: () => void, host?: string): boolean {
  return joinOrStart("request", retry, host);
}

/** The user clicked Sign in: promote the offer to a dialog request. */
export function acceptCloudSessionSignInOffer(): boolean {
  const { offer } = useCloudSessionSignInStore.getState();
  if (offer === null) return false;
  useCloudSessionSignInStore.setState({ offer: null });
  return requestCloudSessionSignIn(offer.retry, offer.host);
}

export function toolAuthStateIsForHost(
  state: Pick<ToolAuthState, "hostname"> | undefined,
  host: string | undefined,
): boolean {
  return host === undefined || state?.hostname === host;
}

export function clearCloudSessionSignIn() {
  useCloudSessionSignInStore.setState({ request: null, offer: null });
}
