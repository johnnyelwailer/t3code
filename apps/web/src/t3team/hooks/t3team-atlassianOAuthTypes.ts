/**
 * The public contract of `useAtlassianOAuth` — the states a sign-in attempt can be in, and what
 * the hook hands back. Split from the hook so the several `t3team-atlassianOAuth*` modules that
 * make up this flow can name a state without importing the React hook that drives it.
 */
import type {
  AtlassianAccessibleResource,
  TokenExchangeResult,
} from "@t3tools/integrations-atlassian";

export type OAuthState =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "waiting" }
  /**
   * Sign-in has to be opened by the user rather than by us — the browser refused the popup, or it
   * was closed before finishing. Neither is a failure, so this carries a live `signinUrl` and the
   * attempt keeps waiting.
   *
   * `expired` is set once the server reports this exact link can no longer finish. The wait itself
   * does not stop: the caller should say the link expired and let `mintFreshSigninLink` replace it.
   */
  | { kind: "needs_manual_open"; signinUrl: string; expired?: boolean }
  | { kind: "exchanging" }
  | { kind: "listing_sites" }
  | { kind: "done"; token: TokenExchangeResult; sites: ReadonlyArray<AtlassianAccessibleResource> }
  /**
   * The server completed the flow itself, because sign-in finished somewhere this tab cannot see —
   * another browser, another profile, a phone. No token comes back: the consumer's job is to reload
   * the account list rather than to connect anything.
   */
  | { kind: "connected" }
  | { kind: "error"; message: string };

export type UseAtlassianOAuthResult = {
  state: OAuthState;
  startOAuth: (clientId?: string) => Promise<void>;
  /**
   * Begins a brand new server-owned flow and swaps it in, replacing `signinUrl` and clearing any
   * `expired` flag. The link just displayed stays valid — minting a successor never consumes it — so
   * this is safe to call opportunistically rather than only once a link is known to be dead.
   */
  mintFreshSigninLink: () => Promise<string>;
  reset: () => void;
};
