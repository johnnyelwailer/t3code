import { postJson } from "~/t3team/backend/t3team-t3BackendHttp";

/**
 * Client side of the server-owned Atlassian OAuth flow.
 *
 * The tab-owned flow in `t3team-useAtlassianOAuth.ts` can only finish in the browser that started
 * it, because that tab holds the PKCE verifier. Here the server holds it, so a `begin` call yields a
 * plain link the user can open anywhere — the browser their Atlassian session actually lives in, or
 * their phone — and whichever browser lands on the callback page just couriers `code` + `state` back.
 *
 * Every request is origin-relative on purpose. This module has to work in a browser that has never
 * paired with the server and therefore has no backend context to read an API base URL from. Being
 * origin-relative is safe because the callback page can only ever be reached at the registered
 * redirect URI, which lives on the origin that serves the app: in production the server serves the
 * SPA itself, and in dev the Vite dev server proxies `/api` to it.
 */
export const ATLASSIAN_OAUTH_BEGIN_PATH = "/api/t3team/atlassian/oauth/begin";
export const ATLASSIAN_OAUTH_COMPLETE_PATH = "/api/t3team/atlassian/oauth/complete";

function defaultApiBaseUrl(): string {
  return window.location.origin;
}

export type AtlassianOAuthServerFlowStart = {
  readonly state: string;
  /** Public URL; carries the PKCE challenge, never the verifier. */
  readonly authorizeUrl: string;
  readonly expiresAtMs: number;
  /**
   * The link to hand to another browser or phone. Built from the origin the user already has the app
   * open on rather than from the server's own `Host`, which in dev is a port only this machine can
   * reach and which a tunnelled or LAN setup would get wrong.
   */
  readonly shareUrl: string;
};

type BeginResponse = {
  readonly state: string;
  readonly authorizeUrl: string;
  readonly beginPath: string;
  readonly beginUrl: string;
  readonly expiresAtMs: number;
};

export async function beginAtlassianOAuthServerFlow(input: {
  readonly redirectUri: string;
  readonly apiBaseUrl?: string;
}): Promise<AtlassianOAuthServerFlowStart> {
  const apiBaseUrl = input.apiBaseUrl ?? defaultApiBaseUrl();
  const response = await postJson<{ redirectUri: string }, BeginResponse>(
    apiBaseUrl,
    ATLASSIAN_OAUTH_BEGIN_PATH,
    { redirectUri: input.redirectUri },
  );
  return {
    state: response.state,
    authorizeUrl: response.authorizeUrl,
    expiresAtMs: response.expiresAtMs,
    shareUrl: new URL(response.beginPath, apiBaseUrl).toString(),
  };
}

export type AtlassianOAuthCallbackParams = {
  readonly code: string;
  readonly state: string;
  readonly error: string;
  readonly errorDescription: string;
};

export function readAtlassianOAuthCallbackParams(href: string): AtlassianOAuthCallbackParams {
  const params = new URL(href).searchParams;
  return {
    code: params.get("code")?.trim() ?? "",
    state: params.get("state")?.trim() ?? "",
    error: params.get("error")?.trim() ?? "",
    errorDescription: params.get("error_description")?.trim() ?? "",
  };
}

export type AtlassianOAuthServerFlowOutcome =
  /** The server has no pending flow under this `state`: a tab-owned flow, or an expired link. */
  | { readonly kind: "not_server_flow" }
  | { readonly kind: "connected" }
  /** Atlassian itself refused — the user declined consent, or the request was rejected. */
  | { readonly kind: "denied"; readonly error: Error }
  | { readonly kind: "failed"; readonly error: unknown };

type CompleteResponse = { readonly status: "unknown_state" | "completed" };

/**
 * Three sequential Atlassian calls happen server-side behind this one request — token exchange,
 * accessible resources, account list — each with its own 12s budget. The default 15s client timeout
 * would abandon a request that was still going to succeed and tell the user it failed.
 */
const COMPLETE_TIMEOUT_MS = 60_000;

/**
 * Hand a finished sign-in back to the server. Never throws: the callback page has to render
 * something useful for every outcome, including "this was not our flow".
 */
export async function completeAtlassianOAuthServerFlow(input: {
  readonly href: string;
  readonly apiBaseUrl?: string;
}): Promise<AtlassianOAuthServerFlowOutcome> {
  let params: AtlassianOAuthCallbackParams;
  try {
    params = readAtlassianOAuthCallbackParams(input.href);
  } catch (error) {
    return { kind: "failed", error };
  }

  if (params.error) {
    return {
      kind: "denied",
      error: new Error(
        `Atlassian declined the sign-in: ${params.error} ${params.errorDescription}`,
      ),
    };
  }
  if (!params.code || !params.state) {
    return { kind: "not_server_flow" };
  }

  try {
    const response = await postJson<{ state: string; code: string }, CompleteResponse>(
      input.apiBaseUrl ?? defaultApiBaseUrl(),
      ATLASSIAN_OAUTH_COMPLETE_PATH,
      { state: params.state, code: params.code },
      { timeoutMs: COMPLETE_TIMEOUT_MS },
    );
    return response.status === "completed" ? { kind: "connected" } : { kind: "not_server_flow" };
  } catch (error) {
    return { kind: "failed", error };
  }
}
