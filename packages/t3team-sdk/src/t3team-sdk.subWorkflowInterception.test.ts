import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import type * as PassthroughParent from "./__fixtures__/t3team-sdk.subInterceptPassthroughParent.workflow.ts";
import type * as ThreadTurnParent from "./__fixtures__/t3team-sdk.subInterceptThreadTurnParent.workflow.ts";
import type * as ThrowingParent from "./__fixtures__/t3team-sdk.subInterceptThrowingParent.workflow.ts";
import type * as UserInputParent from "./__fixtures__/t3team-sdk.subInterceptUserInputParent.workflow.ts";
import {
  createMockBroker,
  defineWorkflow,
  resumeWorkflow,
  startWorkflow,
  type MockBrokerOutcome,
} from "./t3team-sdk.index.ts";
import { journalFilePath } from "./t3team-sdk.journal.ts";
import { readJournalEntries } from "./t3team-sdk.journalReader.ts";

/**
 * `workflow()`'s third parameter (Epic: sub-workflow effect interception): a caller supplies a
 * per-`HandleKind` handler map for exactly the one child invocation, so it can answer some of
 * that child's effects itself instead of handing it the run's real broker unconditionally. These
 * tests pin the contract from the outside — through real fixture bodies and a real journal —
 * rather than against the composition helper in isolation (that lives in
 * `packages/runbook-threads/src/broker.test.ts`).
 */
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-sub-intercept-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const passthroughParent = defineWorkflow<typeof PassthroughParent>(
  "./__fixtures__/t3team-sdk.subInterceptPassthroughParent.workflow.ts",
);
const userInputParent = defineWorkflow<typeof UserInputParent>(
  "./__fixtures__/t3team-sdk.subInterceptUserInputParent.workflow.ts",
);
const threadTurnParent = defineWorkflow<typeof ThreadTurnParent>(
  "./__fixtures__/t3team-sdk.subInterceptThreadTurnParent.workflow.ts",
);
const throwingParent = defineWorkflow<typeof ThrowingParent>(
  "./__fixtures__/t3team-sdk.subInterceptThrowingParent.workflow.ts",
);
const alwaysDefer = (): MockBrokerOutcome => ({ kind: "defer" });

describe("sub-workflow effect interception", () => {
  it("leaves an unlisted kind completely untouched — it still reaches the real host", async () => {
    // The parent only declares a handler for "wait.until", which the child never fires: its
    // thread.create + thread.turn must travel to THIS broker exactly as they would with no
    // opts argument at all.
    const broker = createMockBroker(
      (envelope): MockBrokerOutcome =>
        envelope.kind === "thread.turn"
          ? { kind: "resolve", reply: "real host summary" }
          : { kind: "resolve", reply: undefined },
    );
    const { result } = (await startWorkflow(
      passthroughParent,
      { topic: "widgets" },
      { runsRoot, tools: [], broker },
    )) as { result: { summary: string } };

    expect(result).toEqual({ summary: "real host summary" });
    expect(broker.sent.map((e) => e.kind)).toEqual(["thread.create", "thread.turn"]);
  });

  it("resolves an intercepted user.input from the handler without suspending, and completes", async () => {
    const broker = createMockBroker(alwaysDefer);
    const run = await startWorkflow(
      userInputParent,
      { subject: "the release" },
      { runsRoot, tools: [], broker, launchThreadId: "launch-thread" },
    );

    // Not suspended: the child's askUser never reached a broker that could defer it.
    expect(run).not.toHaveProperty("suspended", true);
    expect(run).toMatchObject({ result: { answer: "yes, approved by the mock" } });
    // The real host never saw it — a normal (non-intercepted) run of the same child fixture
    // sends "user.input" (see t3team-sdk.childAskUser.test.ts); here it must not appear.
    expect(broker.sent.map((e) => e.kind)).not.toContain("user.input");
  });

  it("lets a parent supply a child's thread.turn result — deterministic sub-workflow testing", async () => {
    const broker = createMockBroker(alwaysDefer);
    const run = await startWorkflow(
      threadTurnParent,
      { topic: "widgets" },
      { runsRoot, tools: [], broker },
    );

    expect(run).not.toHaveProperty("suspended", true);
    expect(run).toMatchObject({ result: { summary: "a deterministically mocked summary" } });
    // thread.create is one-way and untouched by this handler map (only "thread.turn" is
    // declared); thread.turn itself must never reach the real broker.
    expect(broker.sent.map((e) => e.kind)).toEqual(["thread.create"]);
  });

  it("surfaces a throwing handler as a real error — no silent fallthrough to the host", async () => {
    const broker = createMockBroker(alwaysDefer);
    await expect(
      startWorkflow(throwingParent, { topic: "widgets" }, { runsRoot, tools: [], broker }),
    ).rejects.toThrow(/the mock cannot answer this one/);
    // A silent fallthrough would have sent "thread.turn" to the real host looking for an answer;
    // a real throw never gets that far.
    expect(broker.sent.map((e) => e.kind)).toEqual(["thread.create"]);
  });

  it("journals the handler's name as provenance, and a resume reports the same value", async () => {
    const broker = createMockBroker(alwaysDefer);
    const started = await startWorkflow(
      threadTurnParent,
      { topic: "gadgets" },
      { runsRoot, tools: [], broker },
    );
    const { runId } = started as { readonly runId: string };

    const before = await readJournalEntries(journalFilePath(runsRoot, runId));
    const beforeResolved = [...before.byCorrelation.values()].find(
      (entry) => entry.kind === "thread.turn",
    );
    expect(beforeResolved?.by).toBe("fixtures.deterministic-agent-mock");

    // Absent means the real host answered — the OTHER (thread.create) entry never went through
    // an interceptor at all, so it must carry no provenance.
    const createEntry = [...before.byCorrelation.values()].find(
      (entry) => entry.kind === "thread.create",
    );
    expect(createEntry?.by).toBeUndefined();

    const resumed = await resumeWorkflow(
      runId,
      threadTurnParent,
      { topic: "gadgets" },
      { runsRoot, tools: [], broker: createMockBroker(alwaysDefer) },
    );
    expect(resumed).toMatchObject({ result: { summary: "a deterministically mocked summary" } });

    // Replay reads the recorded reply straight off the journal — the handler is never invoked a
    // second time — so the provenance line on disk must be byte-identical to before the resume.
    const after = await readJournalEntries(journalFilePath(runsRoot, runId));
    const afterResolved = [...after.byCorrelation.values()].find(
      (entry) => entry.kind === "thread.turn",
    );
    expect(afterResolved).toEqual(beforeResolved);
  });
});
