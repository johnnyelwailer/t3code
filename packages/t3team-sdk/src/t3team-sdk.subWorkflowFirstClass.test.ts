import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import type * as Grandparent from "./__fixtures__/t3team-sdk.subAskUserGrandparent.workflow.ts";
import type * as ParallelSiblings from "./__fixtures__/t3team-sdk.subParallelSiblings.workflow.ts";
import type * as Recursive from "./__fixtures__/t3team-sdk.subRecursive.workflow.ts";
import { demoScripts } from "./t3team-sdk.engineFixtures.ts";
import {
  appendResolvedEntry,
  createMockBroker,
  defineWorkflow,
  resumeWorkflow,
  startWorkflow,
  type MockBrokerOutcome,
} from "./t3team-sdk.index.ts";

/**
 * The behaviours that make a sub-workflow FIRST CLASS rather than a sealed side-quest.
 *
 * Before this, `workflow()` ran its child inside a black box: one journal entry for the whole
 * sub-run, no journaling of anything the child did, and — the consequence that actually bit — an
 * ask raised inside a child got an in-memory resolver, so the question only survived while the
 * process did. Nesting was capped at one level for the same reason. This file pins the three
 * properties that had to become true instead.
 */
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-sub-first-class-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const grandparent = defineWorkflow<typeof Grandparent>(
  "./__fixtures__/t3team-sdk.subAskUserGrandparent.workflow.ts",
);
const recursive = defineWorkflow<typeof Recursive>(
  "./__fixtures__/t3team-sdk.subRecursive.workflow.ts",
);
const parallelSiblings = defineWorkflow<typeof ParallelSiblings>(
  "./__fixtures__/t3team-sdk.subParallelSiblings.workflow.ts",
);
const alwaysDefer = (): MockBrokerOutcome => ({ kind: "defer" });

describe("first-class sub-workflows", () => {
  it("escalates a question raised two levels down to the launching thread, and suspends durably on it", async () => {
    const broker = createMockBroker(alwaysDefer);
    const run = await startWorkflow(
      grandparent,
      {},
      { runsRoot, tools: [], broker, launchThreadId: "launch-thread" },
    );

    // Suspended, not merely blocked: the ask was journaled, so the answer may arrive after a
    // restart. A black-boxed child could not reach this state at all.
    expect(run).toHaveProperty("suspended", true);

    const input = broker.sent.find((event) => event.kind === "user.input");
    expect(input, "the child's question reached the broker").toBeDefined();
    // Depth is invisible to the user: the question lands in the thread they launched from.
    expect(input!.payload).toMatchObject({ threadId: "launch-thread" });
    expect((input!.payload as { question: string }).question).toContain("Approve the deployment?");
  });

  it("resumes a suspended sub-workflow with the user's answer and returns it up the chain", async () => {
    const broker = createMockBroker(alwaysDefer);
    const started = await startWorkflow(
      grandparent,
      {},
      { runsRoot, tools: [], broker, launchThreadId: "launch-thread" },
    );
    expect(started).toHaveProperty("suspended", true);
    const { runId, correlationId } = started as {
      readonly runId: string;
      readonly correlationId: string;
    };

    const wrote = await appendResolvedEntry({
      runsRoot,
      runId,
      correlationId,
      reply: "yes, ship it",
    });
    expect(wrote).toBe(true);

    const resumed = await resumeWorkflow(
      runId,
      grandparent,
      {},
      {
        runsRoot,
        tools: [],
        broker: createMockBroker(alwaysDefer),
        launchThreadId: "launch-thread",
      },
    );

    // The answer travelled back out through BOTH levels, which is only possible because each level
    // is a real body whose result is decoded against its own `meta.outputs`.
    expect(resumed).toMatchObject({ result: { answer: "yes, ship it" } });
  });

  // Regression: an adversarial review of the first revision found that the cycle guard used one
  // push/pop stack shared by the whole run, which cannot model CONCURRENT siblings. Two `parallel`
  // thunks invoking the same sub-workflow made the second see the first's entry and refuse a legal
  // composition as recursion — and `pop()` removed whichever entry happened to be last rather than
  // the one that call had pushed, so the chain was wrong mid-flight even for different refs. The
  // guard is an immutable chain threaded by value now; siblings cannot see each other at all.
  it("allows the same sub-workflow to run twice concurrently as parallel siblings", async () => {
    const result = await startWorkflow(
      parallelSiblings,
      {},
      { runsRoot, tools: [], scripts: demoScripts },
    );
    expect(result).toMatchObject({ result: { first: "hi eins", second: "hi zwei" } });
  });

  it("refuses a recursive sub-workflow by name rather than blowing the stack", async () => {
    await expect(
      startWorkflow(recursive, {}, { runsRoot, tools: [], broker: createMockBroker(alwaysDefer) }),
    ).rejects.toThrow(/recursion is refused/);
  });
});
