import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  ATLASSIAN_API_BASE,
  AtlassianOAuthError,
  AtlassianOAuthSessionExpiredError,
  isDeadRefreshTokenResponse,
  listAccessibleResources,
  refreshAccessToken,
} from "./oauth.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("refreshAccessToken", () => {
  it("classifies a dead refresh token as a session-expired error without the raw body", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json(
        {
          error: "unauthorized_client",
          error_description: "refresh_token is invalid",
        },
        { status: 403 },
      ),
    ) as unknown as typeof fetch;

    await expect(
      refreshAccessToken({ clientId: "client-1" }, "dead-refresh-token"),
    ).rejects.toThrowError(AtlassianOAuthSessionExpiredError);
    // The upstream JSON must stay out of the user-facing message.
    await expect(
      refreshAccessToken({ clientId: "client-1" }, "dead-refresh-token"),
    ).rejects.toThrowError("Sign in again");
  });

  it("keeps the generic refresh error for non-auth failures (outage, 500)", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json(
        { error: "server_error", error_description: "try again later" },
        { status: 500 },
      ),
    ) as unknown as typeof fetch;

    await expect(
      refreshAccessToken({ clientId: "client-1" }, "refresh-token"),
    ).rejects.toThrowError(AtlassianOAuthError);
  });
});

describe("isDeadRefreshTokenResponse", () => {
  it("matches the documented dead-token shapes only", () => {
    expect(
      isDeadRefreshTokenResponse(
        403,
        JSON.stringify({
          error: "unauthorized_client",
          error_description: "refresh_token is invalid",
        }),
      ),
    ).toBe(true);
    expect(
      isDeadRefreshTokenResponse(
        401,
        JSON.stringify({ error: "invalid_grant", error_description: "refresh_token expired" }),
      ),
    ).toBe(true);
    expect(isDeadRefreshTokenResponse(500, JSON.stringify({ error: "unauthorized_client" }))).toBe(
      false,
    );
    expect(isDeadRefreshTokenResponse(403, JSON.stringify({ error: "invalid_scope" }))).toBe(false);
    expect(isDeadRefreshTokenResponse(403, "not json")).toBe(false);
  });
});

describe("listAccessibleResources", () => {
  it("requests accessible resources from api.atlassian.com", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json([
        {
          id: "cloud-123",
          url: "https://example.atlassian.net",
          name: "Example",
          scopes: ["read:jira-work"],
        },
      ]),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const sites = await listAccessibleResources("access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      `${ATLASSIAN_API_BASE}/oauth/token/accessible-resources`,
      {
        headers: {
          Authorization: "Bearer access-token",
          Accept: "application/json",
        },
      },
    );
    expect(sites).toEqual([
      {
        id: "cloud-123",
        url: "https://example.atlassian.net",
        name: "Example",
        scopes: ["read:jira-work"],
      },
    ]);
  });
});
