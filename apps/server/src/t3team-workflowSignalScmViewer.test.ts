import { BUILTIN_SIGNAL_SOURCES, type SignalSourceContext } from "@t3team/sdk";
import { describe, expect, it } from "@effect/vitest";
import type { PullRequestDetail } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { PersistenceSqlError } from "./persistence/Errors.ts";
import type { ViewerPrRead } from "./t3team-myworkViewerPrLoader.ts";
import {
  entriesNeedingDetail,
  parseViewerCursor,
  settleViewerPoll,
  viewerEntryKey,
  type DetailOutcome,
  type ViewerPrEntry,
} from "./t3team-workflowSignalScmViewerDiff.ts";
import { makeWorkflowSignalSourceCatalog } from "./t3team-workflowSignalCatalog.ts";
import { startScmViewerSignalInstance } from "./t3team-workflowSignalSourceScmViewer.ts";

const entry = (number: number, over: Partial<ViewerPrEntry> = {}): ViewerPrEntry => ({
  host: "github.com",
  repository: "o/r",
  number,
  title: `PR ${number}`,
  headBranch: "",
  state: "open",
  isDraft: false,
  updatedAt: "2026-10-07T10:00:00Z",
  viewerReviewRequested: false,
  viewerAuthored: true,
  ...over,
});

const detailOf = (number: number, over: Partial<PullRequestDetail> = {}): PullRequestDetail =>
  ({
    provider: "github",
    number,
    title: `PR ${number}`,
    url: `https://github.com/o/r/pull/${number}`,
    baseBranch: "main",
    headBranch: "feature",
    isDraft: false,
    headSha: "h1",
    baseSha: "b1",
    changedFiles: 3,
    additions: 10,
    deletions: 2,
    ...over,
  }) as unknown as PullRequestDetail;

const read = (
  entries: ViewerPrEntry[],
  incompleteHosts: string[] = [],
  over: Partial<ViewerPrRead> = {},
): ViewerPrRead => ({
  entries,
  signedInHosts: ["github.com", "ghe.example"],
  incompleteHosts,
  truncatedHosts: [],
  ...over,
});

const detailsFor = (...details: PullRequestDetail[]) =>
  new Map<string, DetailOutcome>(
    details.map((d) => [
      viewerEntryKey({ host: "github.com", repository: "o/r", number: d.number }),
      { kind: "detail", detail: d },
    ]),
  );

/** Settle one baseline poll over `entries`, returning the cursor a later poll diffs against. */
const baselineOf = (entries: ViewerPrEntry[], ...details: PullRequestDetail[]) => {
  const { cursor, events } = settleViewerPoll(null, read(entries), detailsFor(...details));
  expect(events).toEqual([]);
  return cursor;
};

describe("viewer change-request cursor diff", () => {
  it("baselines without emitting, learning authored heads only", () => {
    const entries = [entry(1), entry(2, { viewerAuthored: false, viewerReviewRequested: true })];
    expect(entriesNeedingDetail(null, entries).map((e) => e.number)).toEqual([1]);
    const cursor = baselineOf(entries, detailOf(1));
    expect(cursor.entries[viewerEntryKey(entries[0]!)]?.headSha).toBe("h1");
    expect(cursor.entries[viewerEntryKey(entries[1]!)]?.headSha).toBeNull();
  });

  it("emits `opened` for a new authored PR and `review-requested` for a new requested one", () => {
    const cursor = baselineOf([entry(1)], detailOf(1));
    const asked = entry(3, { viewerAuthored: false, viewerReviewRequested: true });
    const entries = [entry(1), entry(2), asked];
    expect(entriesNeedingDetail(cursor, entries).map((e) => e.number)).toEqual([2, 3]);
    const { events } = settleViewerPoll(
      cursor,
      read(entries),
      detailsFor(detailOf(2), detailOf(3)),
    );
    expect(events.map((e) => [e.payload.changeRequest.number, e.payload.reason])).toEqual([
      [2, "opened"],
      [3, "review-requested"],
    ]);
    expect(events[0]!.payload).toMatchObject({ headSha: "h1", baseSha: "b1", changedFiles: 3 });
  });

  it("emits `review-requested` when an existing PR gains the request", () => {
    const before = entry(1, { viewerAuthored: false });
    const cursor = baselineOf([before]);
    const now = entry(1, { viewerAuthored: false, viewerReviewRequested: true });
    expect(entriesNeedingDetail(cursor, [now])).toHaveLength(1);
    const { events } = settleViewerPoll(cursor, read([now]), detailsFor(detailOf(1)));
    expect(events.map((e) => e.payload.reason)).toEqual(["review-requested"]);
  });

  it("emits `pushed` only when the head moved on a viewer-authored PR", () => {
    const cursor = baselineOf([entry(1), entry(2)], detailOf(1), detailOf(2));
    const moved = [
      entry(1, { updatedAt: "2026-10-07T11:00:00Z" }),
      entry(2, { updatedAt: "2026-10-07T11:00:00Z" }),
    ];
    const { events, cursor: next } = settleViewerPoll(
      cursor,
      read(moved),
      detailsFor(detailOf(1, { headSha: "h2" }), detailOf(2)), // #2 only got a comment
    );
    expect(events.map((e) => [e.payload.changeRequest.number, e.payload.reason])).toEqual([
      [1, "pushed"],
    ]);
    expect(next.entries[viewerEntryKey(moved[0]!)]?.headSha).toBe("h2");
  });

  it("never emits `pushed` for a PR the viewer only reviews", () => {
    const reviewing = entry(1, { viewerAuthored: false, viewerReviewRequested: true });
    const cursor = baselineOf([reviewing]);
    const later = { ...reviewing, updatedAt: "2026-10-07T12:00:00Z" };
    expect(entriesNeedingDetail(cursor, [later])).toEqual([]);
  });

  it("reports an unknown head origin as a fork, and passes the author's standing through", () => {
    const { events } = settleViewerPoll(
      baselineOf([]),
      read([entry(5)]),
      detailsFor(detailOf(5, { authorAssociation: "FIRST_TIME_CONTRIBUTOR" })),
    );
    expect(events[0]!.payload.changeRequest).toMatchObject({
      isCrossRepository: true,
      authorAssociation: "FIRST_TIME_CONTRIBUTOR",
      viewerAuthored: true,
    });
  });

  it("leaves a failed read pending, so the event arrives on the next poll", () => {
    const cursor = baselineOf([entry(1, { viewerAuthored: false })]);
    const asked = entry(1, { viewerAuthored: false, viewerReviewRequested: true });
    const failed = new Map<string, DetailOutcome>([[viewerEntryKey(asked), { kind: "failed" }]]);
    const held = settleViewerPoll(cursor, read([asked]), failed);
    expect(held.events).toEqual([]);
    expect(entriesNeedingDetail(held.cursor, [asked])).toHaveLength(1);
  });

  it("remembers an unlinked repository and stops asking about it", () => {
    const cursor = baselineOf([]);
    const stranger = entry(9);
    const refused = new Map<string, DetailOutcome>([
      [viewerEntryKey(stranger), { kind: "unlinked" }],
    ]);
    const settled = settleViewerPoll(cursor, read([stranger]), refused);
    expect(settled.events).toEqual([]);
    const later = { ...stranger, updatedAt: "2026-10-07T13:00:00Z" };
    expect(entriesNeedingDetail(settled.cursor, [later])).toEqual([]);
  });

  it("keeps a failed host's PRs across the gap, and forgets a read-to-the-end host's", () => {
    const cursor = baselineOf([entry(1), entry(2, { host: "ghe.example" })], detailOf(1));
    const gap = settleViewerPoll(cursor, read([], ["github.com"]), new Map());
    expect(Object.keys(gap.cursor.entries)).toEqual(["github.com:o/r#1"]);
    const allBlind = settleViewerPoll(cursor, read([], ["*"]), new Map());
    expect(Object.keys(allBlind.cursor.entries)).toHaveLength(2);
    // Recovery does not look like a flood: the kept entries are not new.
    const back = settleViewerPoll(gap.cursor, read([entry(1)]), new Map());
    expect(back.events).toEqual([]);
    expect(settleViewerPoll(cursor, read([]), new Map()).cursor.entries).toEqual({});
  });
});

describe("a baseline taken while a host could not be read", () => {
  const blind = (hosts: string[]) => read([entry(1)], hosts);

  it("stays silent for that host until one complete read of it, then settles", () => {
    const first = settleViewerPoll(null, blind(["github.com"]), detailsFor(detailOf(1)));
    expect(first.cursor.pending).toEqual(["github.com"]);
    // PR 2 was hidden by the failure; it surfaces now and must be absorbed, not launched.
    const second = settleViewerPoll(
      first.cursor,
      read([entry(1), entry(2)], ["github.com"]),
      detailsFor(detailOf(2)),
    );
    expect(second.events).toEqual([]);
    expect(second.cursor.pending).toEqual(["github.com"]);
    const third = settleViewerPoll(
      second.cursor,
      read([entry(1), entry(2), entry(3)]),
      detailsFor(detailOf(3)),
    );
    expect(third.events).toEqual([]); // the first complete read is still absorbed
    expect(third.cursor.pending).toBeUndefined();
    const fourth = settleViewerPoll(
      third.cursor,
      read([entry(1), entry(2), entry(3), entry(4)]),
      detailsFor(detailOf(4)),
    );
    expect(fourth.events.map((e) => e.payload.changeRequest.number)).toEqual([4]);
  });

  it("is silent for every host when gh could not list its hosts", () => {
    const first = settleViewerPoll(null, read([], ["*"]), new Map());
    expect(first.cursor.pending).toEqual(["*"]);
    const back = settleViewerPoll(first.cursor, read([entry(1), entry(2)]), new Map());
    expect(back.events).toEqual([]);
  });
});

describe("a host over the search limit", () => {
  const overLimit = (entries: ViewerPrEntry[]) =>
    read(entries, ["github.com"], { truncatedHosts: ["github.com"] });

  it("settles once its read holds still for two polls, then emits only what arrives", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => entry(i + 1, { viewerAuthored: false }));
    const first = settleViewerPoll(null, overLimit(hundred), new Map());
    expect(first.cursor.pending).toEqual(["github.com"]);
    // A changed read is not yet stable: still silent, still pending.
    const shifted = [...hundred.slice(1), entry(900, { viewerAuthored: false })];
    const second = settleViewerPoll(first.cursor, overLimit(shifted), new Map());
    expect(second.events).toEqual([]);
    expect(second.cursor.pending).toEqual(["github.com"]);
    // The same read again: settled (still silent for this poll), pending cleared.
    const third = settleViewerPoll(second.cursor, overLimit(shifted), new Map());
    expect(third.events).toEqual([]);
    expect(third.cursor.pending).toBeUndefined();
    // Then a genuinely new PR is emitted, one event, no flood.
    const fresh = entry(500, { viewerAuthored: false, viewerReviewRequested: true });
    const fourth = settleViewerPoll(
      third.cursor,
      overLimit([...shifted, fresh]),
      detailsFor(detailOf(500)),
    );
    expect(fourth.events.map((e) => [e.payload.changeRequest.number, e.payload.reason])).toEqual([
      [500, "review-requested"],
    ]);
  });

  it("emits a new PR on the very next poll after a lost cursor with 100 PRs open", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => entry(i + 1));
    const baseline = settleViewerPoll(
      null,
      read(hundred),
      detailsFor(...hundred.map((e) => detailOf(e.number))),
    );
    expect(baseline.cursor.pending).toBeUndefined();
    const next = settleViewerPoll(
      baseline.cursor,
      read([...hundred, entry(500)]),
      detailsFor(detailOf(500)),
    );
    expect(next.events.map((e) => [e.payload.changeRequest.number, e.payload.reason])).toEqual([
      [500, "opened"],
    ]);
  });

  it("never settles a FAILING host by repeating an empty read", () => {
    const failing = read([], ["github.com"]);
    const first = settleViewerPoll(null, failing, new Map());
    const second = settleViewerPoll(first.cursor, failing, new Map());
    expect(second.cursor.pending).toEqual(["github.com"]);
    expect(second.cursor.stable).toBeUndefined();
  });
});

describe("a host that signs out and back in", () => {
  it("keeps its entries untouched and emits nothing when it returns", () => {
    const five = [1, 2, 3, 4, 5].map((n) => entry(n));
    const cursor = baselineOf(five, ...five.map((e) => detailOf(e.number)));
    const loggedOut = settleViewerPoll(
      cursor,
      read([], [], { signedInHosts: ["ghe.example"] }),
      new Map(),
    );
    expect(loggedOut.events).toEqual([]);
    expect(Object.keys(loggedOut.cursor.entries)).toHaveLength(5);
    expect(loggedOut.cursor.entries).toEqual(cursor.entries);
    const loggedIn = settleViewerPoll(loggedOut.cursor, read(five), new Map());
    expect(loggedIn.events).toEqual([]);
  });

  it("resumes diffing where it left off: a push made while signed out is one `pushed`", () => {
    const cursor = baselineOf([entry(1)], detailOf(1));
    const out = settleViewerPoll(cursor, read([], [], { signedInHosts: [] }), new Map());
    const moved = entry(1, { updatedAt: "2026-10-07T15:00:00Z" });
    const back = settleViewerPoll(
      out.cursor,
      read([moved]),
      detailsFor(detailOf(1, { headSha: "h9" })),
    );
    expect(back.events.map((e) => e.payload.reason)).toEqual(["pushed"]);
  });

  it("stays pending while signed out, so a blind baseline is not settled by an absence", () => {
    const first = settleViewerPoll(null, read([], ["github.com"]), new Map());
    const out = settleViewerPoll(first.cursor, read([], [], { signedInHosts: [] }), new Map());
    expect(out.cursor.pending).toEqual(["github.com"]);
  });
});

describe("parseViewerCursor", () => {
  it("treats missing, unreadable, and foreign-version cursors as lost", () => {
    expect(parseViewerCursor(null)).toBeNull();
    expect(parseViewerCursor("{not json")).toBeNull();
    expect(parseViewerCursor(JSON.stringify({ v: 2, entries: {} }))).toBeNull();
    expect(parseViewerCursor(JSON.stringify({ v: 1 }))).toBeNull();
    expect(parseViewerCursor(JSON.stringify({ v: 1, entries: [] }))).toBeNull();
    expect(parseViewerCursor(JSON.stringify({ v: 1, entries: {} }))).toEqual({ v: 1, entries: {} });
  });
});

describe("startScmViewerSignalInstance", () => {
  const harness = (initialCursor: string | null) => {
    let cursor = initialCursor;
    const emitted: Array<{ key: string; reason: string }> = [];
    let deliveryDown = false;
    let prs = read([entry(1)]);
    const details = new Map<number, Effect.Effect<PullRequestDetail, never>>([
      [1, Effect.succeed(detailOf(1))],
      [2, Effect.succeed(detailOf(2))],
    ]);
    const ctx: SignalSourceContext<{ projectId: string }> = {
      params: { projectId: "p1" },
      emit: async (_signal, key, payload) => {
        if (deliveryDown) throw new PersistenceSqlError({ operation: "db", detail: "busy" });
        emitted.push({ key, reason: (payload as { reason: string }).reason });
      },
      getCursor: async () => cursor,
      setCursor: async (value) => {
        cursor = value;
      },
    };
    const instance = startScmViewerSignalInstance({
      ctx,
      readViewerPrs: async () => prs,
      detail: (ref) => details.get(ref.number) ?? Effect.die("unexpected read"),
      pollMs: 120_000,
      log: () => {},
    });
    return {
      instance,
      emitted,
      cursor: () => cursor,
      setPrs: (next: ViewerPrRead) => (prs = next),
      setDeliveryDown: (down: boolean) => (deliveryDown = down),
      lose: () => (cursor = null),
    };
  };

  it("emits nothing on the first pass, then one event per change, keyed by change request", async () => {
    const h = harness(null);
    try {
      await h.instance.tick();
      expect(h.emitted).toEqual([]);
      expect(h.cursor()).not.toBeNull();
      h.setPrs(read([entry(1), entry(2)]));
      await h.instance.tick();
      expect(h.emitted).toEqual([{ key: "github.com:o/r#2", reason: "opened" }]);
      await h.instance.tick(); // nothing new: nothing emitted
      expect(h.emitted).toHaveLength(1);
    } finally {
      h.instance.stop();
    }
  });

  it("re-baselines after a lost cursor instead of replaying every open PR", async () => {
    const h = harness(null);
    try {
      await h.instance.tick();
      h.setPrs(read([entry(1), entry(2)]));
      h.lose();
      await h.instance.tick();
      expect(h.emitted).toEqual([]);
      expect(parseViewerCursor(h.cursor())?.entries).toHaveProperty(["github.com:o/r#2"]);
      await h.instance.tick();
      expect(h.emitted).toEqual([]);
    } finally {
      h.instance.stop();
    }
  });

  it("holds the cursor while delivery is down, then delivers once and advances", async () => {
    const h = harness(null);
    try {
      await h.instance.tick();
      h.setPrs(read([entry(1), entry(2)]));
      h.setDeliveryDown(true);
      const before = h.cursor();
      await h.instance.tick();
      expect(h.emitted).toEqual([]);
      expect(h.cursor()).toBe(before);
      h.setDeliveryDown(false);
      await h.instance.tick();
      expect(h.emitted).toEqual([{ key: "github.com:o/r#2", reason: "opened" }]);
      expect(h.cursor()).not.toBe(before);
    } finally {
      h.instance.stop();
    }
  });
});

describe("the catalog's viewer source", () => {
  it("is declared by the SDK and started by the host under the same name", async () => {
    const name = "scm.viewer.change-requests";
    expect(BUILTIN_SIGNAL_SOURCES.map((s) => s.name)).toContain(name);
    const catalog = makeWorkflowSignalSourceCatalog({
      pullRequestService: {} as never,
      viewerPollMs: 60_000,
    });
    expect(catalog.sourceNames.has(name)).toBe(true);
    const ctx = (params: unknown) =>
      ({
        params,
        emit: async () => {},
        getCursor: async () => null,
        setCursor: async () => {},
      }) as never;
    await expect(catalog.start(name, ctx({}))).rejects.toThrow(/failed its declaration schema/);
    const handle = await catalog.start(name, ctx({ projectId: "p1" }));
    await handle.stop?.();
  });
});
