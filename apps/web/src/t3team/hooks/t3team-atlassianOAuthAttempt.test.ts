// @vitest-environment jsdom
import { ATLASSIAN_OAUTH_FLOW_TTL_MS } from "@t3tools/integrations-atlassian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { runAtlassianOAuthAttempt } from "./t3team-atlassianOAuthAttempt";
import {
  ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
  type AtlassianOAuthCallbackMessage,
} from "~/t3team/components/t3team-atlassianOAuthCallbackMessage";

const REDIRECT_URI = "http://localhost:5736/oauth/callback";
const TAB_STATE = "tab-state";
const SERVER_STATE = "server-state";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** What the user closing the sign-in window looks like to the poller. */
function closedPopup(): WindowProxy {
  return { closed: true, close: () => {} } as unknown as WindowProxy;
}

function deliverCallback(href: string) {
  const message: AtlassianOAuthCallbackMessage = {
    type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
    href,
  };
  window.dispatchEvent(new MessageEvent("message", { data: message }));
}

function startAttempt(overrides: {
  readonly popup: WindowProxy | null;
  readonly listAccountIds?: () => Promise<ReadonlyArray<string>>;
  readonly baselineAccountIds?: ReadonlyArray<string>;
  readonly onNeedsManualOpen?: () => void;
}) {
  return runAtlassianOAuthAttempt({
    popup: overrides.popup,
    redirectUri: REDIRECT_URI,
    tabState: TAB_STATE,
    serverState: SERVER_STATE,
    listAccountIds: overrides.listAccountIds ?? (async () => []),
    baselineAccountIds: Promise.resolve(overrides.baselineAccountIds ?? []),
    onNeedsManualOpen: overrides.onNeedsManualOpen ?? (() => {}),
  });
}

describe("runAtlassianOAuthAttempt", () => {
  it("treats a closed popup as needing a manual open and keeps waiting for the callback", async () => {
    const onNeedsManualOpen = vi.fn();
    const attempt = startAttempt({ popup: closedPopup(), onNeedsManualOpen });

    // Past the grace period the popup poller gives up on the window — but not on the sign-in.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onNeedsManualOpen).toHaveBeenCalledTimes(1);

    // Still live: the user opens the link themselves and the code arrives over the channel.
    deliverCallback(`${REDIRECT_URI}?code=code-1&state=${TAB_STATE}`);

    await expect(attempt).resolves.toEqual({ kind: "code", code: "code-1" });
  });

  it("finishes without an exchange when the server completed the flow in another browser", async () => {
    const onNeedsManualOpen = vi.fn();
    let polls = 0;
    const attempt = startAttempt({
      popup: closedPopup(),
      baselineAccountIds: ["cloud-old"],
      listAccountIds: async () => {
        polls += 1;
        return polls > 1 ? ["cloud-old", "cloud-new"] : ["cloud-old"];
      },
      onNeedsManualOpen,
    });

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(attempt).resolves.toEqual({ kind: "server_connected" });
    expect(onNeedsManualOpen).toHaveBeenCalledTimes(1);
  });

  it("gives up only once the shared flow TTL has passed, and says the link expired", async () => {
    const attempt = startAttempt({ popup: closedPopup() });
    const settled = attempt.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(ATLASSIAN_OAUTH_FLOW_TTL_MS - 60_000);
    // Still waiting nine minutes past the old two-minute limit.
    await expect(Promise.race([settled, Promise.resolve("pending")])).resolves.toBe("pending");

    await vi.advanceTimersByTimeAsync(120_000);
    await expect(settled).resolves.toMatchObject({ message: expect.stringContaining("expired") });
  });

  it("accepts a callback carrying the server flow's state without trying to exchange it", async () => {
    const attempt = startAttempt({ popup: null });

    await vi.advanceTimersByTimeAsync(0);
    deliverCallback(`${REDIRECT_URI}?code=code-1&state=${SERVER_STATE}`);

    await expect(attempt).resolves.toEqual({ kind: "server_connected" });
  });

  it("still rejects a state belonging to neither flow", async () => {
    const attempt = startAttempt({ popup: null });

    await vi.advanceTimersByTimeAsync(0);
    deliverCallback(`${REDIRECT_URI}?code=code-1&state=someone-elses-state`);

    await expect(attempt).rejects.toThrow("OAuth state mismatch");
  });

  it("reports an Atlassian refusal from the callback rather than a bare mismatch", async () => {
    const attempt = startAttempt({ popup: null });

    await vi.advanceTimersByTimeAsync(0);
    deliverCallback(`${REDIRECT_URI}?error=access_denied&error_description=Declined`);

    await expect(attempt).rejects.toThrow("access_denied");
  });
});
