import * as Data from "effect/Data";

export class AtlassianOAuthError extends Data.TaggedError("AtlassianOAuthError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const AUTH_BASE = "https://auth.atlassian.com";
const OAUTH_SCOPES = ["read:jira-work", "read:jira-user", "write:jira-work"];

export type PkcePair = {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
};

function base64UrlEncode(input: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < input.length; i++) {
    binary += String.fromCharCode(input[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

export async function generatePkce(): Promise<PkcePair> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const codeVerifier = base64UrlEncode(verifierBytes);
  const hash = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hash);
  return { codeVerifier, codeChallenge };
}

export type AtlassianOAuthConfig = {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly clientSecret?: string;
  readonly scopes?: ReadonlyArray<string>;
};

export function buildAuthorizeUrl(
  config: AtlassianOAuthConfig,
  pkce: PkcePair,
  state: string,
): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: config.clientId,
    scope: (config.scopes ?? OAUTH_SCOPES).join(" "),
    redirect_uri: config.redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export type TokenExchangeResult = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
};

export async function exchangeCode(
  config: AtlassianOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenExchangeResult> {
  const response = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.clientId,
      ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new AtlassianOAuthError({
      message: `Token exchange failed (${response.status}): ${text}`,
    });
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function refreshAccessToken(
  config: Pick<AtlassianOAuthConfig, "clientId" | "clientSecret">,
  refreshToken: string,
): Promise<TokenExchangeResult> {
  const response = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: config.clientId,
      ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new AtlassianOAuthError({
      message: `Token refresh failed (${response.status}): ${text}`,
    });
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export type AtlassianAccessibleResource = {
  readonly id: string;
  readonly url: string;
  readonly name: string;
  readonly scopes: ReadonlyArray<string>;
  readonly avatarUrl?: string;
};

export async function listAccessibleResources(
  accessToken: string,
): Promise<ReadonlyArray<AtlassianAccessibleResource>> {
  const response = await fetch(`${AUTH_BASE}/oauth/token/accessible-resources`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new AtlassianOAuthError({
      message: `Failed to list accessible resources (${response.status}): ${text}`,
    });
  }

  return (await response.json()) as ReadonlyArray<AtlassianAccessibleResource>;
}

export function buildOAuthCallbackHandler(
  config: AtlassianOAuthConfig,
  expectedState: string,
  codeVerifier: string,
): (callbackUrl: string) => Promise<TokenExchangeResult> {
  return async (callbackUrl: string) => {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
      throw new AtlassianOAuthError({
        message: `OAuth error: ${error} — ${errorDescription ?? ""}`,
      });
    }

    if (state !== expectedState) {
      throw new AtlassianOAuthError({
        message: "OAuth state mismatch. Possible CSRF attack.",
      });
    }

    if (!code) {
      throw new AtlassianOAuthError({
        message: "No authorization code in callback.",
      });
    }

    return exchangeCode(config, code, codeVerifier);
  };
}
