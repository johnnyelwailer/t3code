import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  beginAtlassianOAuthServerFlow,
  completeAtlassianOAuthServerFlow,
  getAtlassianOAuthFlowStatus,
  readAtlassianOAuthCallbackParams,
} from "./t3team-atlassianOAuthServerFlow";

const API_BASE = "http://127.0.0.1:13776/";
const CALLBACK = "http://localhost:5736/oauth/callback";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubJsonResponse(body: unknown, ok = true) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("beginAtlassianOAuthServerFlow", () => {
  it("shares the link on the caller's own origin, not the server's reported host", async () => {
    const fetchMock = stubJsonResponse({
      state: "abc",
      authorizeUrl: "https://auth.atlassian.com/authorize?state=abc",
      beginPath: "/api/t3team/atlassian/oauth/begin/abc",
      // Deliberately a host only the server itself can name; the share link must not use it.
      beginUrl: "http://0.0.0.0:13776/api/t3team/atlassian/oauth/begin/abc",
      expiresAtMs: 600_000,
    });

    const started = await beginAtlassianOAuthServerFlow({
      redirectUri: CALLBACK,
      apiBaseUrl: "http://localhost:5736/",
    });

    expect(started.shareUrl).toBe("http://localhost:5736/api/t3team/atlassian/oauth/begin/abc");
    expect(started.state).toBe("abc");
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).toMatchObject({ body: JSON.stringify({ redirectUri: CALLBACK }) });
  });

  it("mints a distinct state and link on every call, so a caller can always request a fresh one", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    let nextState = 0;
    fetchMock.mockImplementation(async () => {
      const state = `state-${nextState++}`;
      return {
        ok: true,
        json: async () => ({
          state,
          authorizeUrl: `https://auth.atlassian.com/authorize?state=${state}`,
          beginPath: `/api/t3team/atlassian/oauth/begin/${state}`,
          beginUrl: `http://0.0.0.0:13776/api/t3team/atlassian/oauth/begin/${state}`,
          expiresAtMs: 600_000,
        }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await beginAtlassianOAuthServerFlow({
      redirectUri: CALLBACK,
      apiBaseUrl: "http://localhost:5736/",
    });
    const second = await beginAtlassianOAuthServerFlow({
      redirectUri: CALLBACK,
      apiBaseUrl: "http://localhost:5736/",
    });

    // Nothing here is cached client-side: every call is a real request, so every click of "Copy
    // sign-in link" or "Sign in to Atlassian" (see t3team-OAuthPopupBlockedNotice.tsx) hands out a
    // link nobody could have already consumed.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.state).not.toBe(second.state);
    expect(first.shareUrl).not.toBe(second.shareUrl);
  });
});

describe("getAtlassianOAuthFlowStatus", () => {
  it("reads the status out of the route named by state", async () => {
    const fetchMock = stubJsonResponse({ status: "pending" });

    await expect(
      getAtlassianOAuthFlowStatus({ state: "s1", apiBaseUrl: API_BASE }),
    ).resolves.toBe("pending");

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect((url as URL).toString()).toBe(`${API_BASE}api/t3team/atlassian/oauth/status/s1`);
  });

  it("passes completed and unknown through unchanged", async () => {
    stubJsonResponse({ status: "completed" });
    await expect(
      getAtlassianOAuthFlowStatus({ state: "s1", apiBaseUrl: API_BASE }),
    ).resolves.toBe("completed");

    stubJsonResponse({ status: "unknown" });
    await expect(
      getAtlassianOAuthFlowStatus({ state: "s1", apiBaseUrl: API_BASE }),
    ).resolves.toBe("unknown");
  });
});

describe("readAtlassianOAuthCallbackParams", () => {
  it("reads code and state, and normalises absent parameters to empty strings", () => {
    expect(readAtlassianOAuthCallbackParams(`${CALLBACK}?code=c1&state=s1`)).toEqual({
      code: "c1",
      state: "s1",
      error: "",
      errorDescription: "",
    });
    expect(readAtlassianOAuthCallbackParams(CALLBACK)).toEqual({
      code: "",
      state: "",
      error: "",
      errorDescription: "",
    });
  });
});

describe("completeAtlassianOAuthServerFlow", () => {
  it("reports a completed flow", async () => {
    stubJsonResponse({ status: "completed" });

    await expect(
      completeAtlassianOAuthServerFlow({
        href: `${CALLBACK}?code=c1&state=s1`,
        apiBaseUrl: API_BASE,
      }),
    ).resolves.toEqual({ kind: "connected" });
  });

  it("reports a state the server does not own, so the tab-owned flow keeps working", async () => {
    stubJsonResponse({ status: "unknown_state" });

    await expect(
      completeAtlassianOAuthServerFlow({
        href: `${CALLBACK}?code=c1&state=s1`,
        apiBaseUrl: API_BASE,
      }),
    ).resolves.toEqual({ kind: "not_server_flow" });
  });

  it("never calls the server when the callback has no code or state", async () => {
    const fetchMock = stubJsonResponse({ status: "completed" });

    await expect(
      completeAtlassianOAuthServerFlow({ href: CALLBACK, apiBaseUrl: API_BASE }),
    ).resolves.toEqual({ kind: "not_server_flow" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an Atlassian refusal without asking the server to exchange anything", async () => {
    const fetchMock = stubJsonResponse({ status: "completed" });

    const outcome = await completeAtlassianOAuthServerFlow({
      href: `${CALLBACK}?error=access_denied&error_description=User+declined&state=s1`,
      apiBaseUrl: API_BASE,
    });

    expect(outcome.kind).toBe("denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a failure instead of throwing when the server rejects the request", async () => {
    stubJsonResponse({ error: "Token exchange failed (400)" }, false);

    const outcome = await completeAtlassianOAuthServerFlow({
      href: `${CALLBACK}?code=c1&state=s1`,
      apiBaseUrl: API_BASE,
    });

    expect(outcome.kind).toBe("failed");
  });
});
