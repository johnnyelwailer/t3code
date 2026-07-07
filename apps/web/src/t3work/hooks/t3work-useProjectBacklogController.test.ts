import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectBacklogAutoRefreshKey,
  buildProjectBacklogRequestKey,
  nextProjectBacklogAutoRefreshBackoffMs,
  shouldAutoRefreshPersistedProjectBacklog,
  shouldPollProjectBacklog,
  shouldSkipProjectBacklogSelectionSyncReload,
} from "./t3work-projectBacklogPolling";

describe("project backlog controller helpers", () => {
  it("builds deterministic request keys from selection and refresh mode", () => {
    expect(
      buildProjectBacklogRequestKey(
        {
          boardId: "95",
          sprintId: "3185",
        },
        { forceRefresh: true },
      ),
    ).toBe("board=95:sprint=3185:filter=default:quickFilters=default:refresh:keep:visible");

    expect(
      buildProjectBacklogRequestKey(
        {
          boardId: "95",
          filterId: "18860",
        },
        { clearProjectCache: true },
      ),
    ).toBe("board=95:sprint=default:filter=18860:quickFilters=default:cached:clear:visible");
  });

  it("distinguishes silent force refreshes from visible refresh requests", () => {
    const selection = {
      boardId: "95",
      sprintId: "3185",
    };

    expect(buildProjectBacklogRequestKey(selection, { forceRefresh: true, silent: true })).toBe(
      "board=95:sprint=3185:filter=default:quickFilters=default:refresh:keep:silent",
    );

    expect(buildProjectBacklogRequestKey(selection, { forceRefresh: true, silent: true })).not.toBe(
      buildProjectBacklogRequestKey(selection, { forceRefresh: true }),
    );
  });

  it("auto refreshes a persisted payload only once per selection fingerprint", () => {
    const selection = {
      boardId: "95",
      sprintId: "3185",
      filterId: "18860",
    };
    const fingerprint = "fp-1";

    expect(
      shouldAutoRefreshPersistedProjectBacklog({
        cacheSource: "persisted",
        selection,
        fingerprint,
        nowMs: 10_000,
        cooldownUntilMs: 0,
        lastAutoRefreshKey: null,
        inFlightRequestKey: null,
      }),
    ).toBe(true);

    expect(
      shouldAutoRefreshPersistedProjectBacklog({
        cacheSource: "persisted",
        selection,
        fingerprint,
        nowMs: 10_000,
        cooldownUntilMs: 0,
        lastAutoRefreshKey: buildProjectBacklogAutoRefreshKey(selection, fingerprint),
        inFlightRequestKey: null,
      }),
    ).toBe(false);
  });

  it("skips automatic persisted refreshes during cooldown or while the same refresh is in flight", () => {
    const selection = {
      boardId: "95",
      sprintId: "3185",
    };

    expect(
      shouldAutoRefreshPersistedProjectBacklog({
        cacheSource: "persisted",
        selection,
        fingerprint: "fp-1",
        nowMs: 5_000,
        cooldownUntilMs: 10_000,
        lastAutoRefreshKey: null,
        inFlightRequestKey: null,
      }),
    ).toBe(false);

    expect(
      shouldAutoRefreshPersistedProjectBacklog({
        cacheSource: "persisted",
        selection,
        fingerprint: "fp-1",
        nowMs: 15_000,
        cooldownUntilMs: 0,
        lastAutoRefreshKey: null,
        inFlightRequestKey: buildProjectBacklogRequestKey(selection, {
          forceRefresh: true,
          silent: true,
        }),
      }),
    ).toBe(false);

    expect(
      shouldAutoRefreshPersistedProjectBacklog({
        cacheSource: "live",
        selection,
        fingerprint: "fp-1",
        forceRefresh: true,
        nowMs: 15_000,
        cooldownUntilMs: 0,
        lastAutoRefreshKey: null,
        inFlightRequestKey: null,
      }),
    ).toBe(false);
  });

  it("backs off automatic refresh failures up to the cap", () => {
    expect(nextProjectBacklogAutoRefreshBackoffMs(0)).toBe(5_000);
    expect(nextProjectBacklogAutoRefreshBackoffMs(5_000)).toBe(10_000);
    expect(nextProjectBacklogAutoRefreshBackoffMs(10_000)).toBe(20_000);
    expect(nextProjectBacklogAutoRefreshBackoffMs(20_000)).toBe(40_000);
    expect(nextProjectBacklogAutoRefreshBackoffMs(40_000)).toBe(60_000);
    expect(nextProjectBacklogAutoRefreshBackoffMs(60_000)).toBe(60_000);
  });

  it("only uses backlog polling for silent force refreshes with a known fingerprint", () => {
    expect(
      shouldPollProjectBacklog({
        options: { forceRefresh: true, silent: true, suppressError: true },
        fingerprint: "sha256:known",
        pollingAvailable: true,
      }),
    ).toBe(true);

    expect(
      shouldPollProjectBacklog({
        options: { forceRefresh: true, silent: false },
        fingerprint: "sha256:known",
        pollingAvailable: true,
      }),
    ).toBe(false);

    expect(
      shouldPollProjectBacklog({
        options: { forceRefresh: true, silent: true, clearProjectCache: true },
        fingerprint: "sha256:known",
        pollingAvailable: true,
      }),
    ).toBe(false);
  });

  it("skips the follow-up cached load when route state is only catching up to a resolved selection", () => {
    expect(
      shouldSkipProjectBacklogSelectionSyncReload({
        hasLoadedResponse: true,
        syncedRequestKey: "board=95:sprint=3185:filter=default:cached:keep:visible",
        nextRequestKey: "board=95:sprint=3185:filter=default:cached:keep:visible",
      }),
    ).toBe(true);

    expect(
      shouldSkipProjectBacklogSelectionSyncReload({
        hasLoadedResponse: false,
        syncedRequestKey: "board=95:sprint=3185:filter=default:cached:keep:visible",
        nextRequestKey: "board=95:sprint=3185:filter=default:cached:keep:visible",
      }),
    ).toBe(false);

    expect(
      shouldSkipProjectBacklogSelectionSyncReload({
        hasLoadedResponse: true,
        syncedRequestKey: "board=95:sprint=3185:filter=default:cached:keep:visible",
        nextRequestKey: "board=95:sprint=4037:filter=default:cached:keep:visible",
      }),
    ).toBe(false);
  });
});
