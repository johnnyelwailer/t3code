import { PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/env", () => ({ isElectron: true }));

import { readAtlassianOAuthRedirectUri } from "./t3team-atlassianOAuthRedirect";
import {
  beginAtlassianOAuthServerFlow,
  completeAtlassianOAuthServerFlow,
  getAtlassianOAuthFlowStatus,
} from "./t3team-atlassianOAuthServerFlow";

/**
 * A flavored desktop build running side by side with the installed app: its own backend listens on
 * 3776, while the default port 3773 belongs to the OTHER app. The desktop bridge reports the primary
 * backend under `PRIMARY_LOCAL_ENVIRONMENT_ID`, exactly as `getLocalEnvironmentBootstraps` does.
 */
const OWN_BACKEND = "http://127.0.0.1:3776/";

function stubDesktopRenderer() {
  vi.stubGlobal("window", {
    location: {
      origin: "t3code-dev://app",
      protocol: "t3code-dev:",
      host: "app",
      href: "t3code-dev://app/settings/connections",
    },
    desktopBridge: {
      getLocalEnvironmentBootstraps: () => [
        {
          id: PRIMARY_LOCAL_ENVIRONMENT_ID,
          label: "Local",
          runningDistro: null,
          httpBaseUrl: OWN_BACKEND,
          wsBaseUrl: "ws://127.0.0.1:3776/",
        },
      ],
      getLocalEnvironmentBearerToken: async () => "desktop-bearer",
    },
  });
}

function stubFetch(body: unknown) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof stubFetch>): string {
  const [url] = fetchMock.mock.calls[0] ?? [];
  return String(url);
}

beforeEach(stubDesktopRenderer);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Atlassian sign-in in a desktop app whose backend is not on the default port", () => {
  it("starts the server-owned flow on its own backend", async () => {
    const fetchMock = stubFetch({
      state: "s1",
      authorizeUrl: "https://auth.atlassian.com/authorize?state=s1",
      beginPath: "/api/t3team/atlassian/oauth/begin/s1",
      beginUrl: "http://127.0.0.1:3776/api/t3team/atlassian/oauth/begin/s1",
      expiresAtMs: 600_000,
    });

    await beginAtlassianOAuthServerFlow({ redirectUri: `${OWN_BACKEND}oauth/callback` });

    expect(requestedUrl(fetchMock)).toBe(`${OWN_BACKEND}api/t3team/atlassian/oauth/begin`);
  });

  it("polls and completes the flow on its own backend", async () => {
    const statusFetch = stubFetch({ status: "pending" });
    await getAtlassianOAuthFlowStatus({ state: "s1" });
    expect(requestedUrl(statusFetch)).toBe(`${OWN_BACKEND}api/t3team/atlassian/oauth/status/s1`);

    const completeFetch = stubFetch({ status: "completed" });
    await completeAtlassianOAuthServerFlow({
      href: `${OWN_BACKEND}oauth/callback?code=c1&state=s1`,
    });
    expect(requestedUrl(completeFetch)).toBe(`${OWN_BACKEND}api/t3team/atlassian/oauth/complete`);
  });

  it("asks Atlassian to redirect back to its own backend's callback", () => {
    expect(readAtlassianOAuthRedirectUri()).toBe(`${OWN_BACKEND}oauth/callback`);
  });
});
