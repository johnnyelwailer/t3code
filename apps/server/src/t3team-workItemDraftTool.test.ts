import { afterEach, assert, beforeEach, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";

import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { callT3TeamWorkItemDraftTool } from "./t3team-toolBrokerBindingWorkItemDraft.ts";
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
const thread = ThreadId.make("thread-draft-A");
const FEATURE_OFF = "Work item detail and drafts is turned off on this host";

beforeEach(() => replaceFeatureFlagPresetValues(new Map([["WORKITEM_DETAIL_DRAFTS", true]])));
afterEach(() => replaceFeatureFlagPresetValues(new Map()));

/**
 * A fake of the Atlassian provider as the broker reaches it: the read side feeds the project
 * scope port, the write side is a spy that must stay untouched (drafts never commit).
 */
const makeProvider = (input: { readonly projectKeys: ReadonlyArray<string> }) => {
  const reads: string[] = [];
  const writes: string[] = [];
  // The commit surface: any call here would be a write to the tracker.
  const commitSurface = {
    updateIssueField: () => writes.push("updateIssueField"),
    addIssueComment: () => writes.push("addIssueComment"),
    createIssue: () => writes.push("createIssue"),
    transitionIssue: () => writes.push("transitionIssue"),
    createIssueLink: () => writes.push("createIssueLink"),
  };
  // The whole provider is handed to the scope service, so a write reachable from it would show.
  const port: Pick<WorkItemReadPort, "searchLive" | "mirrorGet"> = {
    ...commitSurface,
    mirrorGet: () => Effect.succeed(null),
    searchLive: (_binding, jql) => {
      reads.push(jql);
      const key = /^\(key = "([^"]+)"\)/.exec(jql)?.[1];
      return Effect.succeed({
        items:
          key !== undefined && input.projectKeys.includes(key)
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

/** The production publisher pinned to `thread`, over a recording artifact store. */
const makeCarrier = (pinnedTo: ThreadId = thread) => {
  const artifacts: Array<{ readonly threadId: string; readonly payload: any }> = [];
  const publishDraft = makeT3TeamDraftMutationPublisher({
    threadId: pinnedTo,
    removeArtifact: () => Effect.void,
    recordArtifact: (artifact) =>
      Effect.sync(() => {
        artifacts.push(artifact as never);
        return artifact as never;
      }),
  });
  return { artifacts, publishDraft };
};

const run = (input: {
  readonly toolArgs: unknown;
  readonly provider?: ReturnType<typeof makeProvider>;
  readonly carrier?: ReturnType<typeof makeCarrier>;
  readonly connected?: boolean;
}) => {
  const provider = input.provider ?? makeProvider({ projectKeys: ["IES-1", "IES-2"] });
  const carrier = input.carrier ?? makeCarrier();
  return callT3TeamWorkItemDraftTool({
    scopeLabel: "for this thread",
    toolArgs: input.toolArgs,
    threadId: thread,
    workItemReadTools: makeHandlers(provider, input.connected),
    readView: () => Effect.succeed({ state: null }),
    publishDraft: carrier.publishDraft,
  }).pipe(Effect.map((result) => ({ result, provider, carrier })));
};

const text = (result: { readonly content: ReadonlyArray<{ readonly text?: string }> }) =>
  result.content[0]?.text ?? "";

const OPS: ReadonlyArray<{
  readonly args: Record<string, unknown>;
  readonly tool: string;
  readonly field: string;
}> = [
  {
    args: { op: "description", issue_id: "IES-1", body: "New text" },
    tool: "t3team.work_item.description.draft_update",
    field: "description",
  },
  {
    args: { op: "comment", issue_id: "IES-1", body: "A note" },
    tool: "t3team.work_item.comment.draft_create",
    field: "comment",
  },
  {
    args: { op: "assignee", issue_id: "IES-1", assignee_account_id: null },
    tool: "t3team.work_item.assignee.draft_update",
    field: "assignee",
  },
  {
    args: { op: "estimate", issue_id: "IES-1", estimate_value: 3, estimate_mode: "points" },
    tool: "t3team.work_item.estimate.draft_update",
    field: "estimate",
  },
  {
    args: { op: "status", issue_id: "IES-1", target_status: "Done" },
    tool: "t3team.work_item.status.draft_update",
    field: "status",
  },
  {
    args: { op: "subtask_create", issue_id: "IES-1", summary: "Child" },
    tool: "t3team.work_item.subtask.draft_create",
    field: "subtask",
  },
  {
    args: {
      op: "link_add",
      issue_id: "IES-1",
      other_issue_id: "IES-2",
      link_type_name: "Blocks",
      direction: "outward",
    },
    tool: "t3team.work_item.link.draft_create",
    field: "link",
  },
  {
    args: { op: "labels", issue_id: "IES-1", add: ["bug"], remove: ["wontfix"] },
    tool: "t3team.work_item.labels.draft_update",
    field: "labels",
  },
  {
    args: { op: "priority", issue_id: "IES-1", priority: "High" },
    tool: "t3team.work_item.priority.draft_update",
    field: "priority",
  },
  {
    args: { op: "fix_version", issue_id: "IES-1", add: ["2.4.0"] },
    tool: "t3team.work_item.fix_version.draft_update",
    field: "fix_version",
  },
];

it.effect("every op creates exactly one draft artifact on the calling thread", () =>
  Effect.gen(function* () {
    for (const op of OPS) {
      const { result, carrier } = yield* run({ toolArgs: op.args });
      assert.isUndefined(result.isError, `${op.args.op}: ${text(result)}`);
      assert.lengthOf(carrier.artifacts, 1, String(op.args.op));
      const [artifact] = carrier.artifacts;
      assert.strictEqual(artifact?.threadId, thread);
      assert.strictEqual(artifact?.payload.kind, "draft-mutation");
      assert.strictEqual(artifact?.payload.draft.tool, op.tool);
      assert.strictEqual(artifact?.payload.draft.field, op.field);
      assert.strictEqual(artifact?.payload.draft.target.issueIdOrKey, "IES-1");
      assert.strictEqual(artifact?.payload.draft.status, "draft");
    }
  }),
);

it.effect("labels, priority and fix_version drafts carry exactly the proposed change", () =>
  Effect.gen(function* () {
    const patchOf = (args: Record<string, unknown>) =>
      run({ toolArgs: args }).pipe(
        Effect.map(({ carrier }) => carrier.artifacts[0]?.payload.draft.patch),
      );
    assert.deepEqual(
      yield* patchOf({ op: "labels", issue_id: "IES-1", add: [" bug ", "bug", "ui"] }),
      { add: ["bug", "ui"], remove: [] },
    );
    assert.deepEqual(yield* patchOf({ op: "priority", issue_id: "IES-1", priority: " High " }), {
      priority: "High",
    });
    assert.deepEqual(
      yield* patchOf({ op: "fix_version", issue_id: "IES-1", add: ["2.4.0"], remove: ["2.3.0"] }),
      { add: ["2.4.0"], remove: ["2.3.0"] },
    );
  }),
);

it.effect("refuses an empty, contradictory or malformed field change, publishing nothing", () =>
  Effect.gen(function* () {
    for (const toolArgs of [
      { op: "labels", issue_id: "IES-1" },
      { op: "labels", issue_id: "IES-1", add: [], remove: [" "] },
      { op: "labels", issue_id: "IES-1", add: ["a"], remove: ["a"] },
      { op: "labels", issue_id: "IES-1", add: ["two words"] },
      { op: "fix_version", issue_id: "IES-1", remove: [] },
      { op: "fix_version", issue_id: "IES-1", add: ["2.4.0"], remove: ["2.4.0"] },
      { op: "priority", issue_id: "IES-1", priority: "  " },
      { op: "priority", issue_id: "IES-1" },
    ]) {
      const { result, carrier } = yield* run({ toolArgs });
      assert.isTrue(result.isError, JSON.stringify(toolArgs));
      assert.lengthOf(carrier.artifacts, 0);
    }
  }),
);

it.effect("a lower-case key is normalized before it is checked and drafted", () =>
  Effect.gen(function* () {
    const { carrier, provider } = yield* run({
      toolArgs: { op: "comment", issue_id: " ies-1 ", body: "hi" },
    });
    assert.strictEqual(carrier.artifacts[0]?.payload.draft.target.issueIdOrKey, "IES-1");
    assert.include(provider.reads[0], '"IES-1"');
  }),
);

it.effect("no op reaches a commit path: a draft artifact is the only effect", () =>
  Effect.gen(function* () {
    const provider = makeProvider({ projectKeys: ["IES-1", "IES-2"] });
    for (const op of OPS) {
      const { result } = yield* run({ toolArgs: op.args, provider });
      assert.isUndefined(result.isError);
      assert.deepEqual((result.structuredContent as any).draftMutation.commitPolicy, {
        requiresUserApproval: true,
        commitSurface: "t3team-ui",
      });
    }
    // Reads verified membership; the commit surface saw nothing.
    assert.isAbove(provider.reads.length, 0);
    assert.deepEqual(provider.writes, []);
  }),
);

it.effect("refuses an issue_id outside the bound project, publishing nothing", () =>
  Effect.gen(function* () {
    for (const op of OPS) {
      const { result, carrier } = yield* run({ toolArgs: { ...op.args, issue_id: "OTHER-7" } });
      assert.isTrue(result.isError, String(op.args.op));
      assert.include(text(result), "OTHER-7 is not in this project");
      assert.lengthOf(carrier.artifacts, 0);
    }
  }),
);

it.effect("refuses a link target outside the bound project", () =>
  Effect.gen(function* () {
    const { result, carrier } = yield* run({
      toolArgs: {
        op: "link_add",
        issue_id: "IES-1",
        other_issue_id: "OTHER-7",
        link_type_name: "Blocks",
        direction: "outward",
      },
    });
    assert.isTrue(result.isError);
    assert.include(text(result), "OTHER-7 is not in this project");
    assert.lengthOf(carrier.artifacts, 0);
  }),
);

// A removal names only a link id, which the project scope cannot check, so the op does not exist:
// `link_id` of a link between FOREIGN-1 and FOREIGN-2 must not reach the canonical remove tool.
it.effect("has no link_remove op: it is refused before anything is queried or published", () =>
  Effect.gen(function* () {
    const provider = makeProvider({ projectKeys: ["IES-1"] });
    const { result, carrier } = yield* run({
      toolArgs: { op: "link_remove", issue_id: "IES-1", link_id: "9001" },
      provider,
    });
    assert.isTrue(result.isError);
    assert.include(text(result), "Invalid arguments");
    assert.lengthOf(carrier.artifacts, 0);
    assert.deepEqual(provider.reads, []);
  }),
);

it.effect("refuses a subtask whose parent is outside the bound project", () =>
  Effect.gen(function* () {
    const { result, carrier } = yield* run({
      toolArgs: { op: "subtask_create", issue_id: "OTHER-7", summary: "Child" },
    });
    assert.isTrue(result.isError);
    assert.include(text(result), "OTHER-7 is not in this project");
    assert.lengthOf(carrier.artifacts, 0);
  }),
);

it.effect("issue_id is required and must be a key; nothing is queried for anything else", () =>
  Effect.gen(function* () {
    const provider = makeProvider({ projectKeys: ["IES-1"] });
    for (const toolArgs of [
      { op: "comment", body: "x" },
      { op: "comment", issue_id: "10001", body: "x" },
      { op: "comment", issue_id: 'IES-1" OR project = "OTHER', body: "x" },
      {
        op: "link_add",
        issue_id: "IES-1",
        other_issue_id: "not a key",
        link_type_name: "Blocks",
        direction: "inward",
      },
    ]) {
      const { result, carrier } = yield* run({ toolArgs, provider });
      assert.isTrue(result.isError, JSON.stringify(toolArgs));
      assert.lengthOf(carrier.artifacts, 0);
    }
    assert.deepEqual(provider.reads, []);
  }),
);

it.effect(
  "while the drafts flag is off a call gets the feature refusal and Jira is not asked",
  () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map());
      for (const op of OPS) {
        const { result, provider, carrier } = yield* run({ toolArgs: op.args });
        assert.isTrue(result.isError, String(op.args.op));
        assert.include(text(result), FEATURE_OFF);
        assert.lengthOf(carrier.artifacts, 0);
        assert.deepEqual(provider.reads, []);
      }
    }),
);

it.effect("a sign-out between list and call refuses with the not-connected text", () =>
  Effect.gen(function* () {
    const { result, carrier } = yield* run({ toolArgs: OPS[0]!.args, connected: false });
    assert.isTrue(result.isError);
    assert.strictEqual(text(result), JIRA_NOT_CONNECTED_MESSAGE);
    assert.lengthOf(carrier.artifacts, 0);
  }),
);

it.effect(
  "cannot name another thread: the draft lands on the thread the publisher is pinned to",
  () =>
    Effect.gen(function* () {
      const { carrier } = yield* run({
        toolArgs: {
          ...OPS[1]!.args,
          thread_id: "thread-draft-B",
          threadId: "thread-draft-B",
        },
      });
      assert.lengthOf(carrier.artifacts, 1);
      assert.strictEqual(carrier.artifacts[0]?.threadId, thread);
    }),
);

it.effect("fails closed without a thread, a publisher or the scope service", () =>
  Effect.gen(function* () {
    const provider = makeProvider({ projectKeys: ["IES-1"] });
    const carrier = makeCarrier();
    const base = {
      scopeLabel: "for this thread",
      toolArgs: OPS[0]!.args,
      threadId: thread,
      workItemReadTools: makeHandlers(provider),
      readView: () => Effect.succeed({ state: null }),
      publishDraft: carrier.publishDraft,
    };
    for (const missing of ["threadId", "workItemReadTools", "publishDraft"] as const) {
      const result = yield* callT3TeamWorkItemDraftTool({ ...base, [missing]: undefined });
      assert.isTrue(result.isError, missing);
      assert.include(text(result), "is not enabled for this thread");
    }
    assert.lengthOf(carrier.artifacts, 0);
  }),
);
