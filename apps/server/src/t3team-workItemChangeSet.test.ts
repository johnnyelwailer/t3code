import { afterEach, assert, beforeEach, it } from "@effect/vitest";
import {
  hashDraftPayload,
  ThreadId,
  verifyDraftPayloadHash,
  WorkItemChangeSet,
} from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

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
const makeProvider = (projectKeys: ReadonlyArray<string>) => {
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
      return Effect.succeed({
        items:
          key !== undefined && projectKeys.includes(key)
            ? [{ provider: "atlassian", displayId: key, id: key, title: key }]
            : [],
      });
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

/** The production publisher pinned to `thread`, over a recording store that can fail the nth write. */
const makeCarrier = (failOnWrite?: number) => {
  const rows = new Map<string, { threadId: string; kind: string; payload: any }>();
  let writes = 0;
  const publishDraft = makeT3TeamDraftMutationPublisher({
    threadId: thread,
    recordArtifact: (artifact) =>
      Effect.suspend(() => {
        writes += 1;
        if (writes === failOnWrite) return Effect.fail(new Error("disk full") as never);
        rows.set(artifact.id, artifact as never);
        return Effect.succeed(artifact as never);
      }),
  });
  return { rows, publishDraft };
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
        assert.strictEqual(
          operation.payloadHash,
          yield* Effect.promise(() => hashDraftPayload(draft)),
        );
        assert.isTrue(yield* Effect.promise(() => verifyDraftPayloadHash(draft, operation)));
        // An operation whose payload changed after publish no longer verifies.
        const tampered = {
          ...draft,
          patch: { ...draft.patch, body: "changed", targetStatus: "Closed" },
        };
        assert.isFalse(yield* Effect.promise(() => verifyDraftPayloadHash(tampered, operation)));
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

it.effect("a write failing part-way leaves no pending draft and no change set", () =>
  Effect.gen(function* () {
    const { result, carrier } = yield* run({
      toolArgs: { title: "X", operations: OPS },
      carrier: makeCarrier(3),
    });
    assert.isTrue(result.isError);
    assert.include(text(result), "nothing is pending");
    const rows = [...carrier.rows.values()];
    assert.isFalse(rows.some((row) => row.kind === "work-item-change-set"));
    assert.deepEqual(
      rows.map((row) => row.payload.draft.status),
      ["dismissed", "dismissed"],
    );

    const lastWrite = yield* run({
      toolArgs: { title: "X", operations: OPS },
      carrier: makeCarrier(OPS.length + 1),
    });
    assert.isTrue(lastWrite.result.isError);
    assert.isFalse(
      [...lastWrite.carrier.rows.values()].some((row) => row.payload.draft?.status === "draft"),
    );
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
