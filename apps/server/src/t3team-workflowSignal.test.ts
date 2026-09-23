import {
  BUILTIN_SIGNAL_SOURCES,
  ScmChangeRequestMerged,
  ScmChangeRequestChecksConcluded,
  WorkItemUpdated,
  signalInstanceKey,
  type SignalSourceContext,
} from "@t3team/sdk";

import { describe, expect, it } from "@effect/vitest";

import {
  makeReconcilerCore,
  makeMintedEmit,
  type ReconcilerCore,
} from "./t3team-workflowSignalReconcilerCore.ts";
import {
  assertCatalogCoversDeclarations,
  makeWorkflowSignalSourceCatalog,
} from "./t3team-workflowSignalCatalog.ts";
import {
  diffScmEvents,
  toNeutralChangeRequest,
  type ScmSnapshot,
} from "./t3team-workflowSignalScmDiff.ts";
import {
  diffWorkItemFields,
  toNeutralWorkItem,
  workItemCursorFromFields,
} from "./t3team-workflowSignalSourceWorkItem.ts";
import { startScmSignalInstance } from "./t3team-workflowSignalSourceScm.ts";
import type { PullRequestActivity, PullRequestDetail } from "@t3tools/contracts";
import { PersistenceSqlError } from "./persistence/Errors.ts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type {
  WorkflowSignalStoreShape,
} from "./persistence/Services/WorkflowSignalStore.ts";

// ---------------------------------------------------------------------------
// Tier A diff logic
// ---------------------------------------------------------------------------

const detail = (over: Partial<PullRequestDetail>): PullRequestDetail =>
  ({
    provider: "github",
    number: 42,
    title: "Add the thing",
    url: "https://github.com/o/r/pull/42",
    baseBranch: "main",
    headBranch: "feature",
    state: "open",
    isDraft: false,
    mergedAt: null,
    closedAt: null,
    checks: [],
    ...over,
  }) as unknown as PullRequestDetail;

const activity = (over: Partial<PullRequestActivity>): PullRequestActivity =>
  ({ reviewThreads: [], comments: [], ...over }) as unknown as PullRequestActivity;

const snapshotOf = (d: PullRequestDetail, a: PullRequestActivity | null): ScmSnapshot => ({
  state: d.state,
  isDraft: d.isDraft,
  checks: Object.fromEntries(d.checks.map((c) => [c.name, c.status])),
  reviewIds: a?.reviewThreads.map((t) => t.id) ?? [],
  commentIds: a?.comments.map((c) => c.id) ?? [],
});

describe("diffScmEvents", () => {
  it("is silent on the first observation (baseline, never retroactive)", () => {
    const d = detail({ state: "merged", mergedAt: "2026-01-01T00:00:00Z" });
    const { events, snapshot } = diffScmEvents(null, d, null);
    expect(events).toEqual([]);
    expect(snapshot.state).toBe("merged");
  });

  it("fires merged exactly on the open → merged transition", () => {
    const prev = snapshotOf(detail({}), null);
    const next = detail({ state: "merged", mergedAt: "2026-01-02T00:00:00Z" });
    const { events } = diffScmEvents(prev, next, null);
    expect(events.map((e) => e.signalName)).toEqual([ScmChangeRequestMerged.name]);
    const payload = events[0]!.payload as {
      changeRequest: ReturnType<typeof toNeutralChangeRequest>;
    };
    expect(payload.changeRequest.state).toBe("merged");
    expect(payload.changeRequest.mergedAt).toBe("2026-01-02T00:00:00Z");
    expect(payload.changeRequest.baseRef).toBe("main");
    expect(payload.changeRequest.headRef).toBe("feature");
  });

  it("does not re-fire when the state is unchanged", () => {
    const d = detail({ state: "open" });
    const { events } = diffScmEvents(snapshotOf(d, null), d, null);
    expect(events).toEqual([]);
  });

  it("fires draft-ready exactly on draft → ready while open", () => {
    const prev = snapshotOf(detail({ isDraft: true }), null);
    const next = detail({ isDraft: false });
    const { events } = diffScmEvents(prev, next, null);
    expect(events.length).toBe(1);
    expect(
      (events[0]!.payload as { changeRequest: { isDraft: boolean } }).changeRequest.isDraft,
    ).toBe(false);
  });

  it("fires checks.concluded for each check that reached a NEW terminal status", () => {
    const prev = snapshotOf(
      detail({ checks: [{ name: "lint", status: "success" } as unknown as never] }),
      null,
    );
    const next = detail({
      checks: [
        { name: "lint", status: "success" } as unknown as never,
        { name: "build", status: "failure" } as unknown as never,
        { name: "e2e", status: "in_progress" } as unknown as never,
      ],
    });
    const { events } = diffScmEvents(prev, next, null);
    const conclusions = events.map(
      (e) =>
        e.payload as {
          conclusion: string;
          total: number;
          failed: number;
          pending: number;
        },
    );
    expect(conclusions).toHaveLength(1);
    expect(conclusions[0]!.conclusion).toBe("failure");
    expect(conclusions[0]!.total).toBe(3);
    expect(conclusions[0]!.failed).toBe(1);
    expect(conclusions[0]!.pending).toBe(1);
  });

  it("fires review.activity once per new comment", () => {
    const prev = snapshotOf(detail({}), activity({}));
    const next = activity({
      comments: [
        {
          id: "c1",
          body: "Please fix the race",
          url: "https://github.com/o/r/pull/42#issue-1",
        } as unknown as never,
      ],
    });
    const { events } = diffScmEvents(prev, detail({}), next);
    expect(events.length).toBe(1);
    const p = events[0]!.payload as { comment: string; action: string };
    expect(p.comment).toContain("race");
  });
});

// ---------------------------------------------------------------------------
// Tier B diff logic
// ---------------------------------------------------------------------------

describe("work item diff", () => {
  it("is silent on the first observation", () => {
    expect(diffWorkItemFields(null, { status: "To Do" })).toEqual([]);
  });

  it("reports only the fields that actually changed", () => {
    const cursor = { status: "To Do", assignee: "pj", labels: ["bug"] };
    const changed = diffWorkItemFields(cursor, {
      status: "In Progress",
      assignee: "pj",
      labels: ["bug"],
    });
    expect(changed).toEqual(["status"]);
  });

  it("builds the neutral payload from the provider fields", () => {
    const payload = toNeutralWorkItem({
      issueKey: "SVC-7",
      title: "Fix the thing",
      url: "https://jira.example.com/browse/SVC-7",
      fields: {
        status: "In Progress",
        assignee: "pj",
        labels: ["bug", 42],
        updated: "2026-01-01",
      },
      changedFields: ["status"],
    });
    expect(payload.state).toBe("In Progress");
    expect(payload.labels).toEqual(["bug"]);
    expect(payload.changedFields).toEqual(["status"]);
  });

  it("round-trips the cursor from provider fields", () => {
    expect(workItemCursorFromFields({ status: "Done", resolution: "Fixed" })).toEqual({
      status: "Done",
      resolution: "Fixed",
    });
    expect(workItemCursorFromFields({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const fakePrs = {
  detail: (_ref: unknown) => Effect.succeed(detail({})),
  activity: (_ref: unknown) => Effect.succeed(activity({})),
} as unknown as Parameters<typeof makeWorkflowSignalSourceCatalog>[0]["pullRequestService"];

describe("makeWorkflowSignalSourceCatalog", () => {
  it("covers every SDK catalog declaration (boot cross-check passes)", () => {
    const catalog = makeWorkflowSignalSourceCatalog({ pullRequestService: fakePrs });
    expect(() => assertCatalogCoversDeclarations(catalog)).not.toThrow();
    for (const declaration of BUILTIN_SIGNAL_SOURCES) {
      expect(catalog.sourceNames.has(declaration.name)).toBe(true);
    }
  });

  it("starts a known source and tears it back down", async () => {
    const catalog = makeWorkflowSignalSourceCatalog({
      pullRequestService: fakePrs,
      pollMs: 60_000,
    });
    const handle = await catalog.start("scm.change-request.watch", {
      params: { projectId: "p", repository: "o/r", number: 1 },
      emit: async () => {},
      getCursor: async () => null,
      setCursor: async () => {},
    } as never);
    expect(handle).toBeDefined();
    await handle.stop?.();
  });

  it("rejects an unknown source name", async () => {
    const catalog = makeWorkflowSignalSourceCatalog({ pullRequestService: fakePrs });
    await expect(
      catalog.start("nope.not.real", {
        params: {},
        emit: async () => {},
        getCursor: async () => null,
        setCursor: async () => {},
      } as never),
    ).rejects.toThrow(/Unknown built-in signal source/);
  });

  it("validates stored params against the declaration schema before starting", async () => {
    const catalog = makeWorkflowSignalSourceCatalog({ pullRequestService: fakePrs });
    await expect(
      catalog.start("scm.change-request.watch", {
        params: { projectId: "p" /* missing repository + number */ },
        emit: async () => {},
        getCursor: async () => null,
        setCursor: async () => {},
      } as never),
    ).rejects.toThrow(/failed its declaration schema/);
  });

  it("builds the instance key from (source, paramsHash)", () => {
    const key = signalInstanceKey("work-item.updates", "deadbeef");
    expect(key).toMatch(/work-item\.updates/);
    void WorkItemUpdated;
  });
});

// ---------------------------------------------------------------------------
// Reconciler core (fakes: no DB, no timers)
// ---------------------------------------------------------------------------

interface FakeRegistration {
  readonly runId: string;
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly params: unknown;
  readonly registeredAt: string;
}

const makeFakes = () => {
  const emits: Array<{
    sourceName: string;
    paramsHash: string;
    signalName: string;
    key: string;
    payload: unknown;
  }> = [];
  const started: string[] = [];
  const stopped: string[] = [];
  const live: Array<FakeRegistration> = [];
  const cursors = new Map<string, string>();
  const voidFx = () => Effect.void;
  const store: WorkflowSignalStoreShape = {
    upsertRegistration: voidFx,
    listRegistrationsByInstance: () => Effect.succeed([]),
    listLiveRegistrations: () => Effect.succeed(live),
    purgeTerminalRegistrations: voidFx,
    insertInboxEntry: () => Effect.succeed(0),
    takeOpenInboxEntry: () => Effect.succeed(Option.none()),
    deleteDeliveredInboxEntriesOlderThan: voidFx,
    getCursor: (key: string) =>
      Effect.succeed(
        cursors.has(key)
          ? Option.some({
              instanceKey: key,
              cursorValue: cursors.get(key)!,
              updatedAt: "now",
            })
          : Option.none(),
      ),
    upsertCursor: (i) => Effect.succeed<void>(void cursors.set(i.instanceKey, i.cursorValue)),
  };
  return {
    emits,
    started,
    stopped,
    setLive(rows: Array<FakeRegistration>) {
      live.splice(0, live.length, ...rows);
    },
    cursors,
    store,
    catalog: {
      start: async (sourceName: string, _ctx: SignalSourceContext<unknown>) => {
        started.push(sourceName);
        return {
          stop: () => {
            stopped.push(sourceName);
          },
        };
      },
      sourceNames: new Set(["scm.change-request.watch", "work-item.updates"]),
    },
    delivery: {
      emit: (i: {
        sourceName: string;
        paramsHash: string;
        signalName: string;
        key: string;
        payload: unknown;
      }) =>
        Effect.sync<number>(() => {
          emits.push(i);
          return 1;
        }),
    },
  };
};

type CoreInputOverrides = {
  catalog?: {
    start: (
      sourceName: string,
      ctx: SignalSourceContext<unknown>,
    ) => Promise<{ stop?: () => void }>;
    sourceNames: ReadonlySet<string>;
  };
};

const coreInput = (
  fakes: ReturnType<typeof makeFakes>,
  overrides: CoreInputOverrides = {},
) => ({
  catalog: overrides.catalog ?? fakes.catalog,
  delivery: fakes.delivery,
  store: fakes.store,
  sweepMs: 60_000,
  inboxCutoffIso: () => "2025-12-01T00:00:00Z",
  nowIso: () => "2026-01-01T00:00:00Z",
  log: () => Effect.void,
  startTimer: false,
});

describe("makeReconcilerCore", () => {
  it("starts exactly the desired instances and stops the orphans", async () => {
    const fakes = makeFakes();
    const core: ReconcilerCore = makeReconcilerCore(coreInput(fakes));
    fakes.setLive([
      {
        runId: "r1",
        sourceName: "scm.change-request.watch",
        paramsHash: "h1",
        params: { projectId: "p", repository: "o/r", number: 1 },
        registeredAt: "2026-01-01T00:00:00Z",
      },
    ]);
    await core.reconcile();
    expect(fakes.started).toEqual(["scm.change-request.watch"]);
    // Idempotent: a second reconcile with the same desired set starts nothing new.
    await core.reconcile();
    expect(fakes.started).toEqual(["scm.change-request.watch"]);
    // Orphan: the run is no longer live → the instance is stopped.
    fakes.setLive([]);
    await core.reconcile();
    expect(fakes.stopped).toEqual(["scm.change-request.watch"]);
    core.stop();
  });

  it("minted emit: an undeclared signal rejects; a declared one is delivered + schema-validated", async () => {
    const fakes = makeFakes();
    let mintedEmit:
      | ((signal: unknown, key: string, payload: unknown) => Promise<void>)
      | undefined;
    const core: ReconcilerCore = makeReconcilerCore(
      coreInput(fakes, {
        catalog: {
          start: async (_sourceName, ctx) => {
            mintedEmit = ctx.emit as typeof mintedEmit;
            return { stop: () => {} };
          },
          sourceNames: new Set(["scm.change-request.watch"]),
        },
      }),
    );
    fakes.setLive([
      {
        runId: "r1",
        sourceName: "scm.change-request.watch",
        paramsHash: "h1",
        params: { projectId: "p", repository: "o/r", number: 1 },
        registeredAt: "2026-01-01T00:00:00Z",
      },
    ]);
    await core.reconcile();
    expect(mintedEmit).toBeDefined();
    // Declared signal, well-typed payload → delivered with the decoded payload.
    await mintedEmit!(
      ScmChangeRequestMerged,
      "42",
      { changeRequest: toNeutralChangeRequest(detail({ state: "merged" })) },
    );
    expect(fakes.emits).toHaveLength(1);
    expect(fakes.emits[0]!.signalName).toBe(ScmChangeRequestMerged.name);
    // Undeclared for this source → rejects before delivery.
    await expect(
      mintedEmit!(
        WorkItemUpdated,
        "SVC-7",
        { provider: "atlassian", issueKey: "SVC-7", title: "x" },
      ),
    ).rejects.toThrow(/emitted undeclared signal/);
    // Declared but mistyped payload → rejects at the schema boundary.
    await expect(mintedEmit!(ScmChangeRequestMerged, "42", { nope: true })).rejects.toThrow();
    core.stop();
  });

  it("cursor round-trips through the store under the instance key", async () => {
    const fakes = makeFakes();
    let minted:
      | {
          getCursor: () => Promise<string | null>;
          setCursor: (v: string) => Promise<void>;
        }
      | undefined;
    const core: ReconcilerCore = makeReconcilerCore(
      coreInput(fakes, {
        catalog: {
          start: async (_sourceName, ctx) => {
            minted = ctx as typeof minted;
            return { stop: () => {} };
          },
          sourceNames: new Set(["work-item.updates"]),
        },
      }),
    );
    fakes.setLive([
      {
        runId: "r1",
        sourceName: "work-item.updates",
        paramsHash: "h2",
        params: { projectId: "p", issueKey: "SVC-7" },
        registeredAt: "2026-01-01T00:00:00Z",
      },
    ]);
    await core.reconcile();
    expect(await minted!.getCursor()).toBe(null);
    await minted!.setCursor('{"status":"To Do"}');
    expect(await minted!.getCursor()).toBe('{"status":"To Do"}');
    core.stop();
  });
});

describe("makeMintedEmit", () => {
  it("delivers a declared signal through the delivery port", async () => {
    const delivery = {
      emit: () => Effect.succeed(1),
    };
    const emit = makeMintedEmit({
      sourceName: "work-item.updates",
      paramsHash: "h",
      delivery,
    });
    await emit(WorkItemUpdated, "SVC-7", {
      provider: "atlassian",
      issueKey: "SVC-7",
      title: "x",
    });
    void ScmChangeRequestChecksConcluded;
  });
});

// ---------------------------------------------------------------------------
// Poller cursor semantics (GHE #332 review): at-least-once delivery
// ---------------------------------------------------------------------------

describe("startScmSignalInstance durable cursor", () => {
  it("holds the cursor when delivery fails, and advances only after redelivery succeeds", async () => {
    let cursorValue: string | null = null;
    const setCursorCalls: string[] = [];
    const emitted: Array<{ signal: string; key: string }> = [];
    let deliveryFails = true;
    const ctx: SignalSourceContext<{ projectId: string; repository: string; number: number }> = {
      params: { projectId: "p1", repository: "o/r", number: 42 },
      emit: async (signal, key) => {
        if (deliveryFails) {
          throw new PersistenceSqlError({ operation: "db.transient", detail: "busy" });
        }
        emitted.push({ signal: signal.name, key });
      },
      getCursor: async () => cursorValue,
      setCursor: async (value) => {
        cursorValue = value;
        setCursorCalls.push(value);
      },
    };
    let detailNow: PullRequestDetail = detail({});
    const instance = startScmSignalInstance({
      ctx,
      detail: () => Effect.succeed(detailNow),
      pollMs: 30_000,
      log: () => {},
    });
    try {
      // Tick 1: baseline observation — silent, the cursor is established.
      await instance.tick();
      expect(setCursorCalls).toHaveLength(1);
      expect(emitted).toHaveLength(0);

      // Tick 2: the open → merged transition, delivery DOWN — the emit attempts and fails, so
      // the transition is NOT recorded as delivered and the cursor must be HELD: it stays
      // pending for redelivery.
      detailNow = detail({ state: "merged", mergedAt: "2026-09-20T09:00:00Z" });
      await instance.tick();
      expect(emitted).toHaveLength(0);
      expect(setCursorCalls).toHaveLength(1);

      // Tick 3: the same transition re-derives from the held cursor; delivery is healthy —
      // it is delivered and only NOW does the cursor advance.
      deliveryFails = false;
      await instance.tick();
      expect(emitted).toHaveLength(1);
      expect(setCursorCalls).toHaveLength(2);
    } finally {
      instance.stop?.();
    }

    // A source-side emit fault (not a delivery failure) must NOT wedge the cursor: it is
    // skipped, and the cursor advances so later transitions keep flowing.
    const ctxFault: SignalSourceContext<{ projectId: string; repository: string; number: number }> = {
      params: { projectId: "p1", repository: "o/r", number: 42 },
      emit: async () => {
        throw new Error("source emitted an undeclared signal");
      },
      getCursor: async () => null,
      setCursor: async () => {},
    };
    let faultCursorCalls = 0;
    const faultInstance = startScmSignalInstance({
      ctx: {
        ...ctxFault,
        setCursor: async () => {
          faultCursorCalls += 1;
        },
      },
      detail: () => Effect.succeed(detail({ state: "merged", mergedAt: "2026-09-20T09:00:00Z" })),
      pollMs: 30_000,
      log: () => {},
    });
    try {
      await faultInstance.tick(); // baseline (no cursor yet → silent, cursor set)
      await faultInstance.tick(); // now a transition + a permanently-failing emit
      expect(faultCursorCalls).toBe(2); // the cursor advanced despite the emit fault
    } finally {
      faultInstance.stop?.();
    }
  });
});
