// Bounded-execution e2e driver — the REAL t3code durable-runtime host:
// `@t3team/sdk` start/resume + `FsJournalStore` + the checkpoint-aware replay window, with the
// `agent()` steps answered by the on-prem Nexplore AI gateway (OpenAI-compatible).
//
//   node t3team-sdk.boundedExecution.e2e.ts start   # drive the loop; CRASH on thread.create #N
//   node t3team-sdk.boundedExecution.e2e.ts resume  # new host, same run: resume from the window
//
// Crash simulation: in `start` mode the process exits(0) the moment the Nth `thread.create`
// envelope fires — i.e. AFTER the previous iteration's agent + checkpoint are journaled, BEFORE
// the in-flight iteration's agent step. The run's journal is intact on disk (each line fsynced);
// the `resume` drive proves: (a) it continues from the checkpoint, not the top; (b) the
// materialized working set is bounded; (c) journaled agent steps are NOT re-fired.
//
// K / CRASH_CREATE are env-configurable (defaults: 100 / 51). State lives in e2e/.state.

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

import { FsJournalStore, resumeWorkflow, startWorkflow } from "../src/t3team-sdk.index.ts";
import { inspectRun } from "@runbook/core/status";
import type { MessageBroker } from "../src/t3team-sdk.broker.ts";

const dir = NodePath.dirname(fileURLToPath(import.meta.url));
const stateDir = NodePath.join(dir, ".state");
const runsRoot = NodePath.join(stateDir, "runs");
const callsPath = NodePath.join(stateDir, "nexplore-calls.jsonl");

const K = Number(process.env.K ?? "100");
const CRASH_CREATE = Number(process.env.CRASH_CREATE ?? "51"); // create #51 = iteration 50
const RUN_ID = "e2e-bounded-loop";
const BASE_URL = process.env.NEXPLORE_BASE_URL ?? "https://chat.nexplore.dev/v1";
const MODEL = process.env.NEXPLORE_MODEL ?? "no-thinking";

const mode: "start" | "resume" = process.argv[2] === "resume" ? "resume" : "start";
NodeFS.mkdirSync(stateDir, { recursive: true });

if (mode === "start") {
  NodeFS.rmSync(callsPath, { force: true });
}

/** One journaled agent step = one Nexplore chat completion. Every live call is logged. */
async function nexploreAnswer(prompt: string): Promise<string> {
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 32,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Nexplore gateway ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  const data = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };
  const content = data.choices[0]?.message?.content?.trim();
  if (content === undefined || content === null) throw new Error("Nexplore returned no content");
  NodeFS.appendFileSync(callsPath, JSON.stringify({ at: startedAt, prompt }) + "\n");
  return content;
}

let createCount = 0;
const broker: MessageBroker = {
  async send(envelope, resolver) {
    if (envelope.kind === "thread.create") {
      createCount += 1;
      if (mode === "start" && createCount === CRASH_CREATE) {
        // Simulated hard host crash: no checkpoint for the in-flight iteration was journaled.
        process.stdout.write(
          `\n[e2e] simulated host crash on thread.create #${createCount} (iteration ${CRASH_CREATE - 1})\n`,
        );
        process.exit(0);
      }
      return; // one-way verb: never settles a resolver
    }
    if (envelope.kind === "thread.turn") {
      const payload = envelope.payload as { readonly prompt: string };
      const answer = await nexploreAnswer(payload.prompt);
      resolver.resolve(answer);
      return;
    }
    // model.resolve / user.input: not exercised by this body.
    resolver.resolve(undefined);
  },
};

const ref = {
  kind: "workflow" as const,
  path: "t3team.bounded-loop.workflow.ts",
  absolutePath: NodePath.join(dir, "t3team.bounded-loop.workflow.ts"),
};

if (mode === "start") {
  const result = await startWorkflow(ref, { k: K }, { runId: RUN_ID, runsRoot, broker });
  // Unreachable in the crash scenario (the broker exits first); present so a clean drive reports.
  console.log(JSON.stringify({ mode, result }, null, 2));
} else {
  const store = new FsJournalStore(runsRoot);
  if (!(await store.hasRun(RUN_ID))) {
    throw new Error(`no run ${RUN_ID} under ${runsRoot} — run 'start' first`);
  }

  // The checkpoint-aware replay window the host reads instead of the full journal.
  const window = await store.readReplayWindow(RUN_ID);
  const compact = window.checkpoint?.record.state as
    | { readonly i: number; readonly total: number }
    | undefined;

  const callsBefore = NodeFS.existsSync(callsPath)
    ? NodeFS.readFileSync(callsPath, "utf8")
        .trimEnd()
        .split("\n")
        .filter((l) => l.length > 0).length
    : 0;

  process.stdout.write(
    `[e2e] resume window: boundary seq=${window.checkpoint?.seq}, compact state=${JSON.stringify(
      compact,
    )}, materialized=${window.materializedEntries}/${window.totalEntries} entries\n`,
  );

  const result = await resumeWorkflow(RUN_ID, ref, { k: K }, { runsRoot, broker });
  const callsAfter = NodeFS.readFileSync(callsPath, "utf8")
    .trimEnd()
    .split("\n")
    .filter((l) => l.length > 0).length;

  const finalStatus = await inspectRun(store, RUN_ID);
  const lines = NodeFS.readFileSync(NodePath.join(runsRoot, RUN_ID, "journal.jsonl"), "utf8")
    .trimEnd()
    .split("\n")
    .filter((l) => l.length > 0).length;

  const metrics = {
    mode,
    k: K,
    crashAfterCreates: CRASH_CREATE,
    resume: {
      boundarySeq: window.checkpoint?.seq,
      compactState: compact,
      materializedEntries: window.materializedEntries,
      totalEntries: window.totalEntries,
      nexploreCallsBefore: callsBefore,
      nexploreCallsDuring: callsAfter - callsBefore,
      result,
      peakRssBytes: process.memoryUsage().rss,
    },
    final: {
      journalLines: lines,
      entryCount: finalStatus.entryCount,
      materializedEntryCount: finalStatus.materializedEntryCount,
      checkpointSeq: finalStatus.checkpointSeq,
      state: finalStatus.checkpoint?.state,
    },
  };
  NodeFS.writeFileSync(
    NodePath.join(stateDir, "e2e-metrics.json"),
    JSON.stringify(metrics, null, 2),
  );
  console.log(JSON.stringify(metrics, null, 2));
}
