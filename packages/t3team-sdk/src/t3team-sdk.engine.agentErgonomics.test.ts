/**
 * End-to-end tests for the agent-ergonomics review items, exercised through the real engine so
 * the journal/replay contract is part of the assertion:
 *   1. implicit schema description — a workflow whose prompt restates NOTHING still gets a
 *      decodable reply, because the runtime appended the shape + example; the same run replays
 *      without re-firing the broker (identical payload → identical `argsHash`).
 *   2. replay stability — re-deriving the payload of an identical ask produces the identical
 *      `argsHash`, which is what makes (1) safe to put in the prompt at all.
 *   3. first-class attachments — author objects ride in the payload as STRUCTURE (never inlined
 *      into the prompt), survive the journal round-trip, and replay to the same `argsHash`.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  cleanupRunsRoot,
  envelopeText,
  resetCounters,
  runsRoot,
} from "./t3team-sdk.engineFixtures.ts";
import type * as AttachmentAgentWorkflow from "./__fixtures__/t3team-sdk.attachmentAgent.workflow.ts";
import type * as SchemaPromptWorkflow from "./__fixtures__/t3team-sdk.schemaPrompt.workflow.ts";
import {
  asNamedAttachments,
  createMockBroker,
  defineWorkflow,
  renderAgentAttachments,
  type MessageEnvelope,
  type MockBrokerOutcome,
  resumeWorkflow,
  startWorkflow,
  type SuspendedResult,
  type WorkflowRunResult,
} from "./t3team-sdk.index.ts";
import { journalFilePath } from "./t3team-sdk.journal.ts";
import { readJournalEntries } from "./t3team-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

const schemaPromptWorkflow = defineWorkflow<typeof SchemaPromptWorkflow>(
  "./__fixtures__/t3team-sdk.schemaPrompt.workflow.ts",
);
const attachmentAgentWorkflow = defineWorkflow<typeof AttachmentAgentWorkflow>(
  "./__fixtures__/t3team-sdk.attachmentAgent.workflow.ts",
);

type AnyResult<O> = WorkflowRunResult<O> | SuspendedResult;
function completed<O>(result: AnyResult<O>): O {
  if ("suspended" in result) throw new Error("expected a completed run");
  return result.result;
}

const EXAMPLE_MARKER = "Example of a valid reply: ";

/** A deliberately lenient "model": it replies with whatever example the RUNTIME put in the
 * prompt. It knows nothing about the schema, so the ask can only succeed if the SDK described
 * the shape itself. */
const echoRuntimeExample = (envelope: MessageEnvelope): MockBrokerOutcome => {
  if (envelope.kind !== "thread.turn") return { kind: "defer" };
  const text = envelopeText(envelope);
  const at = text.indexOf(EXAMPLE_MARKER);
  if (at < 0) return { kind: "defer" };
  return { kind: "resolve", reply: text.slice(at + EXAMPLE_MARKER.length).trim() };
};

describe("agent ergonomics — implicit schema description", () => {
  it("answers a schema-typed ask whose prompt restates nothing, and replays identically", async () => {
    const broker = createMockBroker(echoRuntimeExample);
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(schemaPromptWorkflow, { gate: "coverage" }, base);
    expect(completed(run)).toEqual({ verdict: "pass", score: 0 });

    const turn = broker.sent.find((envelope) => envelope.kind === "thread.turn");
    const prompt = envelopeText(turn as MessageEnvelope);
    // The author's prompt is business-focused only…
    expect(prompt.startsWith("Judge gate coverage")).toBe(true);
    // …and the runtime supplied every shape cue, including the annotated field doc.
    expect(prompt).toContain("Required shape:");
    expect(prompt).toContain('"verdict": "pass" | "fail",');
    expect(prompt).toContain("// 0-10, higher is better");
    expect(prompt).toContain(EXAMPLE_MARKER);

    const journal = readJournalEntries(journalFilePath(runsRoot, run.runId));
    const firstHash = [...journal.bySeq.values()].map((entry) => entry.argsHash);
    const resumed = await resumeWorkflow(
      run.runId,
      schemaPromptWorkflow,
      { gate: "coverage" },
      base,
    );
    expect(completed(resumed)).toEqual({ verdict: "pass", score: 0 });
    // Replay re-derives the same description → same payload → same argsHash, no re-fire.
    expect(broker.sent).toHaveLength(2);
    const replayHash = [
      ...readJournalEntries(journalFilePath(runsRoot, run.runId)).bySeq.values(),
    ].map((entry) => entry.argsHash);
    expect(replayHash).toEqual(firstHash);
  });
});

describe("agent ergonomics — first-class attachments", () => {
  const gates = [
    { id: "g1", ok: true },
    { id: "g2", ok: false },
  ];

  it("carries author objects through the payload and journal, never inlined in the prompt", async () => {
    const broker = createMockBroker((envelope) =>
      envelope.kind === "thread.turn" ? { kind: "resolve", reply: "judged" } : { kind: "defer" },
    );
    const base = { runsRoot, tools: [], broker } as const;
    const run = await startWorkflow(attachmentAgentWorkflow, { gates }, base);
    expect(completed(run)).toEqual({ reply: "judged" });

    const turn = broker.sent.find((envelope) => envelope.kind === "thread.turn");
    const payload = turn?.payload as {
      prompt: string;
      attachments?: unknown;
      effort?: string;
      model?: unknown;
    };
    // Structure in the payload — one explicitly named, one named positionally…
    expect(payload.attachments).toEqual([
      { name: "gates", value: gates },
      { name: "data-2", value: { policy: "strict" } },
    ]);
    // …and NOT a single byte of it stringified into the prompt.
    expect(payload.prompt).toBe("Judge these gates");
    // The provider-agnostic effort tier rides on both the create and the turn — no provider or
    // model named anywhere in the workflow.
    expect(payload.effort).toBe("high");
    expect(broker.sent[0]?.payload).toMatchObject({ effort: "high" });
    expect(payload.model).toBeUndefined();

    // The host composes the provider-facing text from the same structure, once.
    expect(renderAgentAttachments(asNamedAttachments(payload.attachments))).toContain('"id": "g1"');

    const firstHash = [
      ...readJournalEntries(journalFilePath(runsRoot, run.runId)).bySeq.values(),
    ].map((entry) => entry.argsHash);
    const resumed = await resumeWorkflow(run.runId, attachmentAgentWorkflow, { gates }, base);
    expect(completed(resumed)).toEqual({ reply: "judged" });
    expect(broker.sent).toHaveLength(2); // replayed, not re-fired
    const replayHash = [
      ...readJournalEntries(journalFilePath(runsRoot, run.runId)).bySeq.values(),
    ].map((entry) => entry.argsHash);
    expect(replayHash).toEqual(firstHash);
  });
});
