import { describe, expect, it } from "vite-plus/test";

import { hashArgs } from "./canonicalJson.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import { ReplayDriftError } from "./errors.ts";
import type { JournalEntry } from "./journalReader.ts";

const LEGACY = { threadId: "t-1", prompt: "old corrective wording" };
const CURRENT = { threadId: "t-1", prompt: "new corrective wording" };

/** A journal written by the previous version: one `sent` ask at seq 1, hashed over LEGACY. */
function recordedJournal(): ReadonlyMap<number, JournalEntry> {
  const at = "2026-09-24T00:00:00.000Z";
  return new Map([
    [
      1,
      {
        seq: 1,
        callId: "1:thread.turn:thread.turn",
        kind: "thread.turn",
        refId: "thread.turn",
        argsHash: hashArgs(LEGACY),
        result: undefined,
        phase: "sent",
        correlationId: "run-1:1",
        startedAt: at,
        endedAt: at,
      } as JournalEntry,
    ],
  ]);
}

function replay(legacyArgs: ReadonlyArray<unknown> | undefined) {
  const fired: string[] = [];
  const runtime = createDurableRuntime({
    journal: recordedJournal(),
    writer: {
      append: () => undefined,
      appendResolved: () => undefined,
      flush: async () => undefined,
      dispose: () => undefined,
    },
    source: { now: () => 0, random: () => 0.5, uuid: () => "u" },
    runId: "run-1",
  });
  const sent = runtime.handles.send({
    kind: "thread.turn",
    refId: "thread.turn",
    args: CURRENT,
    ...(legacyArgs === undefined ? {} : { legacyArgs }),
    fire: async (id) => {
      fired.push(id);
    },
  });
  return { sent, fired };
}

describe("HandleSendCall.legacyArgs", () => {
  it("replays a pre-rewording journal entry as a match, without re-firing", async () => {
    const { sent, fired } = replay([LEGACY]);
    await expect(sent).resolves.toBe("run-1:1");
    expect(fired).toEqual([]);
  });

  it("still drifts when no legacy encoding matches the recorded hash", async () => {
    await expect(replay(undefined).sent).rejects.toBeInstanceOf(ReplayDriftError);
    await expect(replay([{ threadId: "t-1", prompt: "other" }]).sent).rejects.toBeInstanceOf(
      ReplayDriftError,
    );
  });
});
