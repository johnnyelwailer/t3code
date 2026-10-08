/**
 * `useMyWorkDigestGraph`'s state, kept as one value so a round lands atomically and so the scope
 * reset has exactly one thing to replace.
 *
 * `freshness` is the part callers must not ignore: a graph painted from the cache is NOT an
 * answer about the current scope, so the views may show work from it but must never conclude
 * "nothing needs you" from it. Only a successful round for the rendered scope — changed or
 * `unchanged`, both of which are the server confirming what we hold — flips it to "fresh".
 */
import { useState } from "react";

import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { readInitialDigestState } from "./t3team-digestGraphCache";

export type MyWorkDigestGraphState = {
  readonly graph: DigestGraph | null;
  readonly status: "loading" | "ready" | "retrying" | "error";
  readonly error: string | undefined;
  readonly viewerUnresolved: boolean;
  readonly sessionExpired: boolean;
  readonly freshness: "cached" | "fresh";
  /** A round is in flight; with a graph already on screen this is a revalidation, not a load. */
  readonly refreshing: boolean;
};

export function initialMyWorkDigestGraphState(signature: string): MyWorkDigestGraphState {
  const cached = readInitialDigestState(signature);
  return {
    graph: cached.graph,
    status: cached.status,
    error: undefined,
    viewerUnresolved: cached.viewerUnresolved,
    sessionExpired: false,
    freshness: "cached",
    refreshing: false,
  };
}

export function useMyWorkDigestGraphState(resetSignature: string) {
  const [state, setState] = useState(() => initialMyWorkDigestGraphState(resetSignature));
  // Scope changed since the last render: reset in place (React's "adjust state on prop change"
  // pattern) instead of in an effect, so no other scope's graph paints first.
  const [renderedSignature, setRenderedSignature] = useState(resetSignature);
  if (renderedSignature !== resetSignature) {
    setRenderedSignature(resetSignature);
    setState(initialMyWorkDigestGraphState(resetSignature));
  }
  const patch = (next: Partial<MyWorkDigestGraphState>) =>
    setState((current) => ({ ...current, ...next }));
  return { state, patch };
}
