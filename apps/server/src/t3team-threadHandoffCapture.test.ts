import { assert, describe, it } from "@effect/vitest";
import {
  EnvironmentId,
  MessageId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2TurnItem,
  T3TEAM_THREAD_HANDOFF_FACT_KEY,
  type T3TeamThreadHandoffBranchState,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import {
  parseCommitCount,
  readHandoffBranchState,
  UNKNOWN_BRANCH_STATE,
} from "./t3team-threadHandoffBranchState.ts";
import { recordThreadHandoff } from "./t3team-threadHandoff.ts";
import {
  renderThreadHandoffSummary,
  threadHandoffRefusals,
} from "./t3team-threadHandoffCapture.ts";
import type { VcsProcess } from "./vcs/VcsProcess.ts";

const THREAD = ThreadId.make("thread:source");
const RUN_1 = RunId.make("run:1");
const RUN_2 = RunId.make("run:2");
const now = DateTime.makeUnsafe("2026-10-13T00:00:00.000Z");

function item(input: {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly runId: RunId;
  readonly status?: "completed" | "running";
}): OrchestrationV2TurnItem {
  const base = {
    id: TurnItemId.make(`turn-item:${input.id}`),
    threadId: THREAD,
    runId: input.runId,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status: input.status ?? ("completed" as const),
    title: null,
    startedAt: now,
    completedAt: now,
    updatedAt: now,
    messageId: MessageId.make(`message:${input.id}`),
    text: input.text,
  };
  return input.role === "user"
    ? {
        ...base,
        createdBy: "user",
        creationSource: "server",
        type: "user_message",
        inputIntent: "turn_start",
        attachments: [],
      }
    : { ...base, type: "assistant_message", streaming: input.status === "running" };
}

describe("renderThreadHandoffSummary", () => {
  it("renders the whole transcript, including the partial turn of an active run", () => {
    const summary = renderThreadHandoffSummary({
      threadId: THREAD,
      runs: [
        { id: RUN_1, status: "completed", ordinal: 1 },
        { id: RUN_2, status: "running", ordinal: 2 },
      ],
      items: [
        item({ id: "u1", role: "user", text: "Add a retry to the upload", runId: RUN_1 }),
        item({ id: "a1", role: "assistant", text: "Added retry in upload.ts", runId: RUN_1 }),
        item({ id: "u2", role: "user", text: "Now cover it with a test", runId: RUN_2 }),
        item({
          id: "a2",
          role: "assistant",
          text: "Writing upload.test.ts so far",
          runId: RUN_2,
          status: "running",
        }),
      ],
      budget: 16_000,
    });
    assert.include(summary, `Thread: ${THREAD}. Covered app runs: 1-2.`);
    assert.include(summary, "Add a retry to the upload");
    assert.include(summary, "Added retry in upload.ts");
    assert.include(summary, "Writing upload.test.ts so far");
    assert.include(summary, "run-status=running");
  });

  it("drops what does not fit the budget instead of failing", () => {
    const summary = renderThreadHandoffSummary({
      threadId: THREAD,
      runs: [{ id: RUN_1, status: "completed", ordinal: 1 }],
      items: [
        item({ id: "u1", role: "user", text: "x".repeat(40_000), runId: RUN_1 }),
        item({ id: "a1", role: "assistant", text: "short answer", runId: RUN_1 }),
      ],
      budget: 4_000,
    });
    assert.include(summary, "short answer");
    assert.notInclude(summary, "x".repeat(40_000));
    assert.include(summary, "omitted 1 items");
  });
});

const clean: T3TeamThreadHandoffBranchState = {
  upstream: "origin/feature/x",
  unpushedCommits: 0,
  uncommittedChanges: false,
};
const idle = { branch: "feature/x", pendingRuntimeRequest: null } as const;
const refusalsFor = (overrides: Partial<Parameters<typeof threadHandoffRefusals>[0]>) =>
  threadHandoffRefusals({
    shell: idle,
    branchState: clean,
    liveSubagentChildren: 0,
    boundScheduledTasks: 0,
    ...overrides,
  }).map((refusal) => refusal.reason);

describe("threadHandoffRefusals", () => {
  it("is eligible with a pushed, clean branch and nothing pending", () => {
    assert.deepStrictEqual(refusalsFor({}), []);
  });

  it("refuses unpushed commits and shows the count", () => {
    const [refusal] = threadHandoffRefusals({
      shell: idle,
      branchState: { ...clean, unpushedCommits: 3 },
      liveSubagentChildren: 0,
      boundScheduledTasks: 0,
    });
    assert.strictEqual(refusal?.reason, "unpushed_commits");
    assert.include(refusal?.message ?? "", "3 commits on feature/x are not pushed");
  });

  it("refuses a branch with no upstream that has local commits", () => {
    const [refusal] = threadHandoffRefusals({
      shell: idle,
      branchState: { upstream: null, unpushedCommits: 1, uncommittedChanges: false },
      liveSubagentChildren: 0,
      boundScheduledTasks: 0,
    });
    assert.strictEqual(refusal?.reason, "unpushed_commits");
    assert.include(refusal?.message ?? "", "1 local commit");
  });

  it("refuses dirty trees, pending questions, live subagents and bound scheduled tasks", () => {
    assert.deepStrictEqual(
      refusalsFor({
        branchState: { ...clean, uncommittedChanges: true },
        shell: { branch: "feature/x", pendingRuntimeRequest: {} as never },
        liveSubagentChildren: 2,
        boundScheduledTasks: 1,
      }),
      [
        "uncommitted_changes",
        "pending_user_input",
        "live_subagent_children",
        "scheduled_task_bound",
      ],
    );
  });

  it("does not refuse when the branch state could not be read", () => {
    assert.deepStrictEqual(refusalsFor({ branchState: UNKNOWN_BRANCH_STATE }), []);
  });
});

type Vcs = VcsProcess["Service"];
const fakeVcs = (respond: (args: ReadonlyArray<string>) => string | null) => {
  const calls: Array<ReadonlyArray<string>> = [];
  const vcs = {
    run: (input: { readonly args: ReadonlyArray<string> }) => {
      calls.push(input.args);
      const stdout = respond(input.args);
      return Effect.succeed({
        exitCode: stdout === null ? 128 : 0,
        stdout: stdout ?? "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      });
    },
  } as unknown as Vcs;
  return { vcs, calls };
};

describe("readHandoffBranchState", () => {
  it.effect("counts commits ahead of the upstream and sees a dirty tree", () =>
    Effect.gen(function* () {
      const { vcs, calls } = fakeVcs((args) =>
        args[0] === "rev-parse"
          ? "origin/feature/x\n"
          : args[0] === "rev-list"
            ? "2\n"
            : " M a.ts\n",
      );
      const state = yield* readHandoffBranchState(vcs, "/repo");
      assert.deepStrictEqual(state, {
        upstream: "origin/feature/x",
        unpushedCommits: 2,
        uncommittedChanges: true,
      });
      assert.deepStrictEqual(calls[1], ["rev-list", "--count", "@{upstream}..HEAD"]);
    }),
  );

  it.effect("counts commits no remote has when the branch tracks nothing", () =>
    Effect.gen(function* () {
      const { vcs, calls } = fakeVcs((args) =>
        args[0] === "rev-parse" ? null : args[0] === "rev-list" ? "4" : "",
      );
      const state = yield* readHandoffBranchState(vcs, "/repo");
      assert.deepStrictEqual(state, {
        upstream: null,
        unpushedCommits: 4,
        uncommittedChanges: false,
      });
      assert.deepStrictEqual(calls[1], ["rev-list", "--count", "HEAD", "--not", "--remotes"]);
    }),
  );

  it.effect("reports unknown, not clean, when git fails", () =>
    Effect.gen(function* () {
      const { vcs } = fakeVcs(() => null);
      assert.deepStrictEqual(yield* readHandoffBranchState(vcs, "/gone"), UNKNOWN_BRANCH_STATE);
    }),
  );

  it("parses only plain counts", () => {
    assert.strictEqual(parseCommitCount(" 7\n"), 7);
    assert.strictEqual(parseCommitCount("fatal: no upstream"), null);
  });
});

describe("recordThreadHandoff", () => {
  it.effect("writes the link under the handoff fact key, nothing else", () =>
    Effect.gen(function* () {
      const patches: Array<unknown> = [];
      const store = {
        upsert: (_threadId: ThreadId, patch: unknown) =>
          Effect.sync(() => {
            patches.push(patch);
            return {} as never;
          }),
      } as unknown as Parameters<typeof recordThreadHandoff>[1];
      const { link } = yield* recordThreadHandoff(
        {
          threadId: THREAD,
          direction: "moved_to",
          peerEnvironmentId: EnvironmentId.make("env-cloud"),
          peerThreadId: ThreadId.make("thread:successor"),
          peerLabel: "nexi-cloud-1",
        },
        store,
      );
      assert.strictEqual(link.direction, "moved_to");
      assert.deepStrictEqual(Object.keys(patches[0] as object), ["extensions"]);
      assert.deepStrictEqual(Object.keys((patches[0] as { extensions: object }).extensions), [
        T3TEAM_THREAD_HANDOFF_FACT_KEY,
      ]);
    }),
  );

  it.effect("fails visibly where the server has no thread facts", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        recordThreadHandoff(
          {
            threadId: THREAD,
            direction: "moved_from",
            peerEnvironmentId: EnvironmentId.make("env-local"),
            peerThreadId: THREAD,
            peerLabel: "This device",
          },
          undefined,
        ),
      );
      assert.strictEqual(error._tag, "T3TeamThreadHandoffError");
    }),
  );
});
