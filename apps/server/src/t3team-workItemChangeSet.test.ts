// @effect-diagnostics-next-line nodeBuiltinImport:off -- independent SHA-256 of the exported bytes.
import * as NodeCrypto from "node:crypto";

import { afterEach, assert, beforeEach, it } from "@effect/vitest";
import { ThreadId, WorkItemChangeSet } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import {
  hashDraftPayload,
  verifyDraftPayloadHash,
} from "@t3tools/shared/t3team-workItemChangeSetHash";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { callT3TeamWorkItemChangeSetTool } from "./t3team-toolBrokerBindingWorkItemChangeSet.ts";
import type { T3TeamWorkItemReadToolHandlers } from "./t3team-toolBrokerBindingWorkItemRead.ts";
import { makeProjectScope } from "./t3team-workItemProjectScope.ts";
import { JIRA_NOT_CONNECTED_MESSAGE } from "./t3team-workItemReadAvailability.ts";
import type { WorkItemReadPort } from "./t3team-workItemReadService.ts";
import type { JiraMirrorBinding } from "./t3team-workflowSignalWorkItemProjectMirror.ts";

const binding: JiraMirrorBinding = {
  provider: "atlassian",
  accountId: "acct-1",
  externalProjectId: "10001",
};
const thread = ThreadId.make("thread-cs-A");
const decodeChangeSet = Schema.decodeUnknownSync(WorkItemChangeSet);

beforeEach(() => replaceFeatureFlagPresetValues(new Map([["WORKITEM_DETAIL_DRAFTS", true]])));
afterEach(() => replaceFeatureFlagPresetValues(new Map()));

/** The Atlassian provider as the broker reaches it: live reads feed the scope, writes are a spy. */
const makeProvider = (
  projectKeys: ReadonlyArray<string>,
  /** Runs inside every live lookup, before it answers. */
  duringLookup: Effect.Effect<void> = Effect.void,
) => {
  const reads: string[] = [];
  const writes: string[] = [];
  const port: Pick<WorkItemReadPort, "searchLive" | "mirrorGet"> = {
    ...Object.fromEntries(
      ["updateIssueField", "addIssueComment", "createIssue", "transitionIssue"].map((name) => [
        name,
        () => writes.push(name),
      ]),
    ),
    mirrorGet: () => Effect.succeed(null),
    searchLive: (_binding, jql) => {
      reads.push(jql);
      const key = /^\(key = "([^"]+)"\)/.exec(jql)?.[1];
      return duringLookup.pipe(
        Effect.as({
          items:
            key !== undefined && projectKeys.includes(key)
              ? [{ provider: "atlassian", displayId: key, id: key, title: key }]
              : [],
        }),
      );
    },
  };
  return { port, reads, writes };
};

const makeHandlers = (
  provider: ReturnType<typeof makeProvider>,
  connected = true,
): T3TeamWorkItemReadToolHandlers => {
  const scope = makeProjectScope(provider.port);
  return {
    connected: () => Effect.succeed(connected),
    foreignKeys: (keys) =>
      connected ? scope.foreignKeys(binding, keys) : Effect.fail(JIRA_NOT_CONNECTED_MESSAGE),
    search: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
  };
};

/** The production publisher pinned to `thread`, over a recording store with injectable faults. */
const makeCarrier = (
  faults: {
    readonly failOnWrite?: number;
    readonly blockOnWrite?: number;
    readonly failRemove?: (id: string) => boolean;
  } = {},
) => {
  const rows = new Map<string, { threadId: string; kind: string; payload: any }>();
  const blocked = Deferred.makeUnsafe<void>();
  let writes = 0;
  const publishDraft = makeT3TeamDraftMutationPublisher({
    threadId: thread,
    recordArtifact: (artifact) =>
      Effect.suspend(() => {
        writes += 1;
        if (writes === faults.failOnWrite) return Effect.fail(new Error("disk full") as never);
        if (writes === faults.blockOnWrite) {
          return Deferred.succeed(blocked, undefined).pipe(Effect.andThen(Effect.never));
        }
        rows.set(artifact.id, artifact as never);
        return Effect.succeed(artifact as never);
      }),
    removeArtifact: (id) =>
      faults.failRemove?.(id) === true
        ? Effect.fail(new Error("locked") as never)
        : Effect.sync(() => void rows.delete(id)),
  });
  return { rows, blocked, publishDraft };
};

const run = (input: {
  readonly toolArgs: unknown;
  readonly provider?: ReturnType<typeof makeProvider>;
  readonly carrier?: ReturnType<typeof makeCarrier>;
}) => {
  const provider = input.provider ?? makeProvider(["IES-1", "IES-2"]);
  const carrier = input.carrier ?? makeCarrier();
  return callT3TeamWorkItemChangeSetTool({
    scopeLabel: "for this thread",
    toolArgs: input.toolArgs,
    threadId: thread,
    workItemReadTools: makeHandlers(provider),
    readView: () => Effect.succeed({ state: null }),
    publishDraft: carrier.publishDraft,
  }).pipe(Effect.map((result) => ({ result, provider, carrier })));
};

const text = (result: { readonly content: ReadonlyArray<{ readonly text?: string }> }) =>
  result.content[0]?.text ?? "";
const operationErrors = (result: { readonly structuredContent?: unknown }) =>
  (result.structuredContent as { operationErrors?: ReadonlyArray<{ index: number }> })
    .operationErrors;

const OPS = [
  { op: "comment", issue_id: "IES-1", body: "A note" },
  { op: "status", issue_id: "IES-1", target_status: "Done" },
  { op: "subtask_create", issue_id: "IES-2", summary: "Child" },
  {
    op: "link_add",
    issue_id: "IES-1",
    other_issue_id: "IES-2",
    link_type_name: "Blocks",
    direction: "outward",
  },
];

it.effect(
  "N operations publish N drafts and exactly one change set, all on the calling thread",
  () =>
    Effect.gen(function* () {
      const { result, provider, carrier } = yield* run({
        toolArgs: { title: "Tidy up", operations: OPS },
      });
      assert.isUndefined(result.isError, text(result));
      const rows = [...carrier.rows.values()];
      const drafts = rows.filter((row) => row.kind === "draft-mutation");
      const sets = rows.filter((row) => row.kind === "work-item-change-set");
      assert.lengthOf(drafts, OPS.length);
      assert.lengthOf(sets, 1);
      for (const row of rows) assert.strictEqual(row.threadId, thread);

      const changeSet = decodeChangeSet(sets[0]!.payload);
      assert.strictEqual(changeSet.title, "Tidy up");
      assert.strictEqual(changeSet.status, "draft");
      assert.strictEqual(changeSet.sourceThreadId, thread);
      assert.deepEqual(
        changeSet.operations.map((operation) => operation.draftId),
        [...carrier.rows.keys()].filter((id) => id.startsWith("jira-draft:")),
      );
      assert.deepEqual(
        changeSet.operations.map((operation) => operation.field),
        ["comment", "status", "subtask", "link"],
      );
      for (const operation of changeSet.operations) {
        const { draft } = carrier.rows.get(operation.draftId)!.payload;
        assert.strictEqual(draft.status, "draft");
        assert.strictEqual(operation.payloadHash, hashDraftPayload(draft));
        assert.isTrue(verifyDraftPayloadHash(draft, operation));
        // An operation whose payload changed after publish no longer verifies.
        const tampered = {
          ...draft,
          patch: { ...draft.patch, body: "changed", targetStatus: "Closed" },
        };
        assert.isFalse(verifyDraftPayloadHash(tampered, operation));
      }
      // IES-1 and IES-2 are asked once each, however many operations name them.
      assert.lengthOf(provider.reads, 2);
      assert.deepEqual(provider.writes, []);
      assert.strictEqual((result.structuredContent as any).changeSet.id, changeSet.id);
    }),
);

it.effect("one invalid operation publishes nothing and lists it by index", () =>
  Effect.gen(function* () {
    const { result, carrier, provider } = yield* run({
      toolArgs: {
        title: "Bad",
        operations: [OPS[0], { op: "comment", issue_id: "IES-1" }, { op: "nope" }, "x"],
      },
    });
    assert.isTrue(result.isError);
    assert.deepEqual(
      operationErrors(result)?.map(({ index }) => index),
      [1, 2, 3],
    );
    assert.strictEqual(carrier.rows.size, 0);
    assert.deepEqual(provider.reads, []);
  }),
);

it.effect("a foreign key in any position publishes nothing; each distinct key is asked once", () =>
  Effect.gen(function* () {
    const cases = [
      [OPS[0], { op: "comment", issue_id: "OTHER-7", body: "x" }],
      [OPS[0], { ...OPS[3], other_issue_id: "OTHER-7" }],
      [OPS[0], { op: "subtask_create", issue_id: "OTHER-7", summary: "Child" }],
    ];
    for (const operations of cases) {
      const { result, carrier, provider } = yield* run({ toolArgs: { title: "X", operations } });
      assert.isTrue(result.isError);
      assert.deepEqual(
        operationErrors(result)?.map(({ index }) => index),
        [1],
      );
      assert.include(text(result), "OTHER-7 is not in this project");
      assert.strictEqual(carrier.rows.size, 0);
      assert.isAtMost(provider.reads.length, 3);
    }
    const many = Array.from({ length: 20 }, () => ({
      op: "comment",
      issue_id: "OTHER-7",
      body: "x",
    }));
    const { provider, result } = yield* run({ toolArgs: { title: "X", operations: many } });
    assert.lengthOf(operationErrors(result)!, 20);
    assert.lengthOf(provider.reads, 1);
  }),
);

it.effect("refuses an empty set, more than 25 operations and a blank title", () =>
  Effect.gen(function* () {
    const one = { op: "comment", issue_id: "IES-1", body: "x" };
    for (const toolArgs of [
      { title: "X", operations: [] },
      { title: "X", operations: Array.from({ length: 26 }, () => one) },
      { title: "  ", operations: [one] },
      { operations: [one] },
    ]) {
      const { result, carrier, provider } = yield* run({ toolArgs });
      assert.isTrue(result.isError);
      assert.strictEqual(carrier.rows.size, 0);
      assert.deepEqual(provider.reads, []);
    }
  }),
);

it.effect("the recorded hash is the node:crypto SHA-256 of the exact canonical bytes", () =>
  Effect.gen(function* () {
    const { carrier } = yield* run({ toolArgs: { title: "X", operations: [OPS[0]] } });
    const { draft } = [...carrier.rows.values()].find(
      (row) => row.kind === "draft-mutation",
    )!.payload;
    const set = decodeChangeSet(
      [...carrier.rows.values()].find((row) => row.kind === "work-item-change-set")!.payload,
    );
    assert.strictEqual(
      set.operations[0]!.payloadHash,
      NodeCrypto.createHash("sha256")
        .update(
          '{"field":"comment","patch":{"body":"A note"},"target":{"issueIdOrKey":"IES-1","provider":"jira"}}',
        )
        .digest("hex"),
      JSON.stringify(draft),
    );
  }),
);

it.effect("a write failing part-way removes every member written and no change set", () =>
  Effect.gen(function* () {
    const { result, carrier } = yield* run({
      toolArgs: { title: "X", operations: OPS },
      carrier: makeCarrier({ failOnWrite: 3 }),
    });
    assert.isTrue(result.isError);
    assert.include(text(result), "nothing is pending");
    assert.strictEqual(carrier.rows.size, 0);

    const lastWrite = yield* run({
      toolArgs: { title: "X", operations: OPS },
      carrier: makeCarrier({ failOnWrite: OPS.length + 1 }),
    });
    assert.isTrue(lastWrite.result.isError);
    assert.strictEqual(lastWrite.carrier.rows.size, 0);
  }),
);

it.effect("a rollback that also fails names the drafts it could not withdraw", () =>
  Effect.gen(function* () {
    const carrier = makeCarrier({ failOnWrite: 3, failRemove: () => true });
    const { result } = yield* run({ toolArgs: { title: "X", operations: OPS }, carrier });
    assert.isTrue(result.isError);
    assert.notInclude(text(result), "nothing is pending");
    assert.include(text(result), "could not be withdrawn");
    assert.strictEqual(carrier.rows.size, 2);
    // Every row still live is named, so the user can dismiss each by hand.
    for (const id of carrier.rows.keys()) assert.include(text(result), id);
  }),
);

it.effect("an interrupt mid-write still removes what was written", () =>
  Effect.gen(function* () {
    const carrier = makeCarrier({ blockOnWrite: 3 });
    const fiber = yield* run({
      toolArgs: { title: "X", operations: OPS },
      carrier,
    }).pipe(Effect.forkChild({ startImmediately: true }));
    yield* Deferred.await(carrier.blocked);
    assert.strictEqual(carrier.rows.size, 2);
    yield* Fiber.interrupt(fiber);
    assert.strictEqual(carrier.rows.size, 0);
  }),
);

it.effect("the scope check runs at most 4 lookups at once, one per distinct key", () =>
  Effect.gen(function* () {
    let inFlight = 0;
    let peak = 0;
    const provider = makeProvider(
      [],
      Effect.gen(function* () {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        inFlight -= 1;
      }),
    );
    const operations = Array.from({ length: 25 }, (_, index) => ({
      op: "link_add",
      issue_id: `OTHER-${index}`,
      other_issue_id: `OTHER-${index + 100}`,
      link_type_name: "Blocks",
      direction: "outward",
    }));
    const { result } = yield* run({ toolArgs: { title: "X", operations }, provider });
    assert.isTrue(result.isError);
    assert.lengthOf(provider.reads, 50);
    assert.isAbove(peak, 1);
    assert.isAtMost(peak, 4);
  }),
);

it.effect("a scope check that never answers refuses the set after 30 seconds", () =>
  Effect.gen(function* () {
    const carrier = makeCarrier();
    const fiber = yield* callT3TeamWorkItemChangeSetTool({
      scopeLabel: "for this thread",
      toolArgs: { title: "X", operations: [OPS[0]] },
      threadId: thread,
      workItemReadTools: {
        ...makeHandlers(makeProvider(["IES-1"])),
        foreignKeys: () => Effect.never,
      },
      readView: () => Effect.succeed({ state: null }),
      publishDraft: carrier.publishDraft,
    }).pipe(Effect.forkChild({ startImmediately: true }));
    yield* TestClock.adjust("29 seconds");
    assert.isUndefined(fiber.pollUnsafe());
    yield* TestClock.adjust("2 seconds");
    const result = yield* Fiber.join(fiber);
    assert.isTrue(result.isError);
    assert.include(text(result), "timed out");
    assert.strictEqual(carrier.rows.size, 0);
  }),
);

it.effect("is refused while the flag is off or Jira is not connected, and without its ports", () =>
  Effect.gen(function* () {
    const args = { title: "X", operations: [OPS[0]] };
    replaceFeatureFlagPresetValues(new Map());
    const off = yield* run({ toolArgs: args });
    assert.include(text(off.result), "Work item detail and drafts is turned off on this host");
    assert.deepEqual(off.provider.reads, []);

    replaceFeatureFlagPresetValues(new Map([["WORKITEM_DETAIL_DRAFTS", true]]));
    const carrier = makeCarrier();
    const signedOut = yield* callT3TeamWorkItemChangeSetTool({
      scopeLabel: "for this thread",
      toolArgs: args,
      threadId: thread,
      workItemReadTools: makeHandlers(makeProvider(["IES-1"]), false),
      readView: () => Effect.succeed({ state: null }),
      publishDraft: carrier.publishDraft,
    });
    assert.strictEqual(text(signedOut), JIRA_NOT_CONNECTED_MESSAGE);
    assert.strictEqual(carrier.rows.size, 0);

    const base = {
      scopeLabel: "for this thread",
      toolArgs: args,
      threadId: thread,
      workItemReadTools: makeHandlers(makeProvider(["IES-1"])),
      readView: () => Effect.succeed({ state: null }),
      publishDraft: carrier.publishDraft,
    };
    for (const missing of ["threadId", "workItemReadTools", "publishDraft"] as const) {
      const result = yield* callT3TeamWorkItemChangeSetTool({ ...base, [missing]: undefined });
      assert.include(text(result), "is not enabled for this thread");
    }
    assert.strictEqual(carrier.rows.size, 0);
  }),
);
