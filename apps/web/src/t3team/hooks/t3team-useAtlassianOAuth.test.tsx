/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { AtlassianOAuthAttemptOutcome } from "~/t3team/hooks/t3team-atlassianOAuthAttempt";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const {
  mockIsElectron,
  mockOpenOAuthPopup,
  mockBeginAtlassianOAuthServerFlow,
  mockGetAtlassianOAuthFlowStatus,
  mockRunAtlassianOAuthAttempt,
} = vi.hoisted(() => ({
  mockIsElectron: { value: false },
  mockOpenOAuthPopup: vi.fn(),
  mockBeginAtlassianOAuthServerFlow: vi.fn(),
  mockGetAtlassianOAuthFlowStatus: vi.fn(),
  mockRunAtlassianOAuthAttempt: vi.fn(),
}));

vi.mock("~/env", () => ({
  get isElectron() {
    return mockIsElectron.value;
  },
}));

vi.mock("~/t3team/hooks/t3team-atlassianOAuthPopup", () => ({
  openOAuthPopup: mockOpenOAuthPopup,
}));

vi.mock("~/t3team/hooks/t3team-atlassianOAuthServerFlow", () => ({
  beginAtlassianOAuthServerFlow: mockBeginAtlassianOAuthServerFlow,
  getAtlassianOAuthFlowStatus: mockGetAtlassianOAuthFlowStatus,
}));

vi.mock("~/t3team/hooks/t3team-atlassianOAuthAttempt", () => ({
  runAtlassianOAuthAttempt: mockRunAtlassianOAuthAttempt,
}));

vi.mock("~/t3team/hooks/t3team-atlassianOAuthRedirect", () => ({
  readAtlassianOAuthRedirectUri: () => "http://localhost:5736/oauth/callback",
}));

vi.mock("@t3tools/integrations-atlassian", () => ({
  generatePkce: async () => ({ codeVerifier: "verifier", codeChallenge: "challenge" }),
  buildAuthorizeUrl: () => "https://auth.atlassian.test/authorize",
}));

import { useAtlassianOAuth, type OAuthState } from "./t3team-useAtlassianOAuth";

const SHARE_URL = "https://example.test/api/t3team/atlassian/oauth/begin/server-state";
const SERVER_ORIGIN_URL = "http://127.0.0.1:13773/api/t3team/atlassian/oauth/begin/server-state";

function makeBackend(): BackendApi {
  return {
    state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
    connect: async () => undefined,
    disconnect: async () => undefined,
    dispatchCommand: async () => undefined,
    launchRecipeWorkflow: async () => ({ ok: true }),
    submitRecipeCardAction: async () => ({ ok: true }),
    resolveWorkflowInput: async () => undefined,
    listThreadPlacements: async () => [],
    syncThreadToolContext: async () => undefined,
    atlassian: {
      listAccounts: async () => [],
      exchangeOAuthCode: async () => ({
        token: { accessToken: "token", refreshToken: "refresh", expiresAtMs: 0 },
        sites: [],
      }),
    } as unknown as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {} as BackendApi["projectWorkspace"],
  } as unknown as BackendApi;
}

describe("useAtlassianOAuth desktop system-browser flow", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;
  let latest: { result: ReturnType<typeof useAtlassianOAuth> | null };

  function Harness() {
    latest.result = useAtlassianOAuth();
    return null;
  }

  async function mount(): Promise<void> {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <BackendProvider backend={makeBackend()}>
          <Harness />
        </BackendProvider>,
      );
    });
  }

  /**
   * Fires `startOAuth` for an attempt that is left permanently in flight, then waits for `predicate`
   * to hold. Deliberately not wrapped in `act`: React's async `act` only flushes queued updates once
   * its callback's promise settles, so wrapping a call that never resolves would hide every
   * intermediate state this is meant to observe.
   */
  async function startAndWaitFor(predicate: () => void): Promise<void> {
    void latest.result?.startOAuth("client-id");
    await vi.waitFor(predicate);
  }

  beforeEach(() => {
    latest = { result: null };
    mockIsElectron.value = false;
    mockOpenOAuthPopup.mockReset().mockReturnValue({ closed: false } as unknown as WindowProxy);
    mockBeginAtlassianOAuthServerFlow.mockReset().mockResolvedValue({
      state: "server-state",
      authorizeUrl: "https://auth.atlassian.test/authorize",
      expiresAtMs: 0,
      shareUrl: SHARE_URL,
      serverOriginUrl: SERVER_ORIGIN_URL,
    });
    mockGetAtlassianOAuthFlowStatus.mockReset().mockResolvedValue("pending");
    mockRunAtlassianOAuthAttempt.mockReset();
    windowOpenSpy = vi.spyOn(window, "open").mockReturnValue(null);
    delete (window as { desktopBridge?: unknown }).desktopBridge;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    host?.remove();
    root = null;
    host = null;
    windowOpenSpy.mockRestore();
    delete (window as { desktopBridge?: unknown }).desktopBridge;
  });

  it("web: still opens a popup and never touches desktopBridge, and resolves via status polling", async () => {
    mockIsElectron.value = false;
    mockRunAtlassianOAuthAttempt.mockResolvedValue({
      kind: "server_connected",
    } satisfies AtlassianOAuthAttemptOutcome);

    await mount();
    await act(async () => {
      await latest.result?.startOAuth("client-id");
    });

    expect(mockOpenOAuthPopup).toHaveBeenCalledWith("https://auth.atlassian.test/authorize");
    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(latest.result?.state).toEqual<OAuthState>({ kind: "connected" });
  });

  it("desktop: opens the system browser instead of a popup, and resolves via status polling", async () => {
    mockIsElectron.value = true;
    const openExternal = vi.fn(async () => true);
    (window as unknown as { desktopBridge: { openExternal: typeof openExternal } }).desktopBridge =
      {
        openExternal,
      };
    mockRunAtlassianOAuthAttempt.mockResolvedValue({
      kind: "server_connected",
    } satisfies AtlassianOAuthAttemptOutcome);

    await mount();
    await act(async () => {
      await latest.result?.startOAuth("client-id");
    });

    expect(mockOpenOAuthPopup).not.toHaveBeenCalled();
    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith(SERVER_ORIGIN_URL);
    // Resolves via the same server-flow status-polling path the blocked-popup case already uses.
    expect(latest.result?.state).toEqual<OAuthState>({ kind: "connected" });
    // The attempt must know it already opened the link, so a null popup there isn't treated as
    // needing a manual open.
    expect(mockRunAtlassianOAuthAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ popup: null, externallyOpened: true }),
    );
  });

  it("desktop: never opens the tab-owned authUrl and errors when the server flow can't be begun", async () => {
    mockIsElectron.value = true;
    mockBeginAtlassianOAuthServerFlow.mockReset().mockRejectedValue(new Error("network down"));
    const openExternal = vi.fn(async () => true);
    (window as unknown as { desktopBridge: { openExternal: typeof openExternal } }).desktopBridge =
      {
        openExternal,
      };

    await mount();
    await act(async () => {
      await latest.result?.startOAuth("client-id");
    });

    expect(openExternal).not.toHaveBeenCalled();
    expect(mockOpenOAuthPopup).not.toHaveBeenCalled();
    expect(windowOpenSpy).not.toHaveBeenCalled();
    expect(mockRunAtlassianOAuthAttempt).not.toHaveBeenCalled();
    expect(latest.result?.state.kind).toBe("error");
  });

  it("desktop: lands in waiting while the attempt is still in flight", async () => {
    mockIsElectron.value = true;
    const openExternal = vi.fn(async () => true);
    (window as unknown as { desktopBridge: { openExternal: typeof openExternal } }).desktopBridge =
      {
        openExternal,
      };
    mockRunAtlassianOAuthAttempt.mockReturnValue(
      new Promise<AtlassianOAuthAttemptOutcome>(() => {}),
    );

    await mount();
    await startAndWaitFor(() => {
      expect(latest.result?.state).toEqual<OAuthState>({ kind: "waiting" });
    });

    expect(mockOpenOAuthPopup).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith(SERVER_ORIGIN_URL);
  });

  it("desktop: falls back to needs_manual_open when openExternal is unavailable", async () => {
    mockIsElectron.value = true;
    // No window.desktopBridge at all.
    mockRunAtlassianOAuthAttempt.mockReturnValue(
      new Promise<AtlassianOAuthAttemptOutcome>(() => {}),
    );

    await mount();
    await startAndWaitFor(() => {
      expect(latest.result?.state).toEqual<OAuthState>({
        kind: "needs_manual_open",
        signinUrl: SERVER_ORIGIN_URL,
      });
    });

    expect(mockOpenOAuthPopup).not.toHaveBeenCalled();
  });

  it("desktop: falls back to needs_manual_open when openExternal returns false", async () => {
    mockIsElectron.value = true;
    (
      window as unknown as { desktopBridge: { openExternal: (url: string) => Promise<boolean> } }
    ).desktopBridge = {
      openExternal: vi.fn(async () => false),
    };
    mockRunAtlassianOAuthAttempt.mockReturnValue(
      new Promise<AtlassianOAuthAttemptOutcome>(() => {}),
    );

    await mount();
    await startAndWaitFor(() => {
      expect(latest.result?.state).toEqual<OAuthState>({
        kind: "needs_manual_open",
        signinUrl: SERVER_ORIGIN_URL,
      });
    });
  });
});
