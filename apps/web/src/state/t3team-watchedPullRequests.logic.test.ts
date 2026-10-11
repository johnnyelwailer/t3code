import { describe, expect, it } from "vite-plus/test";

import { fixtureLink } from "~/t3team/t3team-prWatchFixtures";

import { ENV, facts, OTHER_ENV, shell } from "./t3team-prWatchShellFixtures";
import {
  collectWatchedPullRequests,
  resolveIndicatorTone,
  resolveWatcherState,
} from "./t3team-watchedPullRequests.logic";

const open = fixtureLink({ repository: "hive/nx-nexi", number: 412, title: "Scope filter" });
const merged = fixtureLink({
  repository: "hive/nx-nexi",
  number: 401,
  title: "Docs",
  state: "merged",
});
const unwatched = fixtureLink({
  repository: "hive/nx-nexi",
  number: 420,
  title: "Spike",
  watched: false,
});
const KEY = "nexplore.ghe.com/hive/nx-nexi#412";

describe("collectWatchedPullRequests", () => {
  it("keys every watched open link by the normalized pull request key", () => {
    const { byKey } = collectWatchedPullRequests(
      [shell({ id: "t1", pullRequests: [open, merged, unwatched] })],
      new Map(),
      ENV,
    );
    expect([...byKey.keys()]).toEqual([KEY]);
    expect(byKey.get(KEY)?.map((w) => w.threadRef.threadId)).toEqual(["t1"]);
  });

  it("matches the key case-insensitively on host and repository", () => {
    const shouting = { ...open, host: "NEXPLORE.ghe.com", repository: "Hive/NX-Nexi" };
    const { byKey } = collectWatchedPullRequests(
      [shell({ id: "t1", pullRequests: [shouting] })],
      new Map(),
      ENV,
    );
    expect(byKey.has(KEY)).toBe(true);
  });

  it("ignores archived or deleted threads and other environments", () => {
    const { byKey } = collectWatchedPullRequests(
      [
        shell({ id: "archived", pullRequests: [open], archivedAt: "2026-10-01T00:00:00.000Z" }),
        shell({ id: "deleted", pullRequests: [open], deletedAt: "2026-10-01T00:00:00.000Z" }),
        shell({ id: "elsewhere", pullRequests: [open], environmentId: OTHER_ENV }),
      ],
      new Map(),
      ENV,
    );
    expect(byKey.size).toBe(0);
  });

  it("lists two watchers of one pull request, the one that needs you first", () => {
    const { byKey } = collectWatchedPullRequests(
      [
        shell({ id: "quiet", pullRequests: [open] }),
        shell({ id: "asking", pullRequests: [open], hasPendingUserInput: true }),
      ],
      new Map(),
      ENV,
    );
    expect(byKey.get(KEY)?.map((w) => [w.threadRef.threadId, w.tone])).toEqual([
      ["asking", "needs-you"],
      ["quiet", "quiet"],
    ]);
  });

  it("marks the babysitter's thread through its chip fact and carries the activity label", () => {
    const { byKey } = collectWatchedPullRequests(
      [shell({ id: "t1", pullRequests: [open] })],
      new Map([
        facts("t1", {
          activityLabel: "Fixing lint",
          extensions: { "nexplore.pr-watch.thread": { ownership: { verdict: "own" } } },
        }),
      ]),
      ENV,
    );
    const watcher = byKey.get(KEY)![0]!;
    expect(watcher.prWatch?.ownership?.verdict).toBe("own");
    expect(watcher.activityLabel).toBe("Fixing lint");
    expect(watcher.recipeId).toBeNull();
  });

  it("names the recipe whose run launched the watching thread", () => {
    const { byKey } = collectWatchedPullRequests(
      [shell({ id: "t1", pullRequests: [open] })],
      new Map([
        facts("t1", {
          extensions: {
            "t3team.launchedBy": {
              runId: "run-1",
              launchThreadId: "home",
              scope: "recipe:pr-watch",
              key: "pr:x#412",
              launchedAt: "2026-10-08T08:00:00.000Z",
            },
          },
        }),
      ]),
      ENV,
    );
    expect(byKey.get(KEY)![0]!.recipeId).toBe("pr-watch");
  });

  it("reads a malformed chip fact as no fact", () => {
    const { byKey } = collectWatchedPullRequests(
      [shell({ id: "t1", pullRequests: [open] })],
      new Map([facts("t1", { extensions: { "nexplore.pr-watch.thread": "nope" } })]),
      ENV,
    );
    expect(byKey.get(KEY)![0]!.prWatch).toBeNull();
  });
});

describe("collectWatchedPullRequests identity", () => {
  it("keeps watcher objects and per-key arrays when their inputs did not change", () => {
    const shells = [
      shell({ id: "t1", pullRequests: [open] }),
      shell({ id: "t2", pullRequests: [open] }),
    ];
    const first = collectWatchedPullRequests(shells, new Map(), ENV);
    const second = collectWatchedPullRequests(shells, new Map(), ENV, first);
    expect(second.byKey).toBe(first.byKey);
    const third = collectWatchedPullRequests(
      [shells[0]!, { ...shells[1]!, hasPendingUserInput: true }],
      new Map(),
      ENV,
      second,
    );
    expect(third.byKey).not.toBe(first.byKey);
    expect(third.byKey.get(KEY)![1]).toBe(first.byKey.get(KEY)![0]);
  });
});

describe("resolveWatcherState", () => {
  const base = { hasPendingUserInput: false, hasPendingApprovals: false, runtime: null };
  it("ranks a docked question above an approval above parked above working", () => {
    expect(
      resolveWatcherState({ ...base, hasPendingUserInput: true, hasPendingApprovals: true }, null)
        .tone,
    ).toBe("needs-you");
    expect(resolveWatcherState({ ...base, hasPendingApprovals: true }, null).statusLabel).toBe(
      "Pending Approval",
    );
    expect(resolveWatcherState(base, { parked: { reason: "limit" } }).statusLabel).toBe("Parked");
    expect(
      resolveWatcherState({ ...base, runtime: { activeRunId: "run-1" } as never }, null).tone,
    ).toBe("working");
    expect(resolveWatcherState(base, null)).toEqual({ tone: "quiet", statusLabel: "Waiting" });
  });
});

describe("resolveIndicatorTone", () => {
  it("paints the strongest watcher", () => {
    expect(
      resolveIndicatorTone([{ tone: "working" }, { tone: "attention" }, { tone: "quiet" }]),
    ).toBe("attention");
    expect(resolveIndicatorTone([])).toBe("quiet");
  });
});
