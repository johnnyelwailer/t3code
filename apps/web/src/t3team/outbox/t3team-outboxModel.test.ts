import { DEFAULT_PROVIDER_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  groupT3TeamOutboxEntriesByEnvironment,
  isTransientT3TeamOutboxError,
  makeT3TeamOutboxEntry,
  decodeT3TeamOutboxEntry,
  t3TeamOutboxRetryDelayMs,
  t3TeamOutboxEntryPreview,
  type T3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxModel";

const turnStartPayload = {
  messageId: "m-1",
  messageText: "hello",
  modelSelection: null,
  titleSeed: "hello",
  runtimeMode: DEFAULT_RUNTIME_MODE,
  interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
  createdAt: "2026-09-13T00:00:00.000Z",
};

function entry(
  over: Partial<T3TeamOutboxEntry> & { kind: T3TeamOutboxEntry["kind"] },
): T3TeamOutboxEntry {
  const base = makeT3TeamOutboxEntry(
    over.kind,
    over.payload ?? (turnStartPayload as T3TeamOutboxEntry["payload"]),
    "env-a",
    "thread-a",
  );
  return { ...base, ...over };
}

describe("groupT3TeamOutboxEntriesByEnvironment", () => {
  it("groups per environment and sorts FIFO by createdAt", () => {
    const later = entry({ kind: "turn-start", createdAt: "2026-09-13T01:00:00.000Z" });
    const earlier = entry({ kind: "turn-start", createdAt: "2026-09-13T00:30:00.000Z" });
    const otherEnvironment = entry({ kind: "turn-start", environmentId: "env-b" });
    const grouped = groupT3TeamOutboxEntriesByEnvironment([later, otherEnvironment, earlier]);
    expect((grouped["env-a"] ?? []).map((item) => item.entryId)).toEqual([
      earlier.entryId,
      later.entryId,
    ]);
    expect(grouped["env-b"]).toEqual([otherEnvironment]);
  });

  it("dedupes nothing and keeps every entry", () => {
    const a = entry({ kind: "turn-start" });
    const b = entry({ kind: "turn-start" });
    expect(Object.values(groupT3TeamOutboxEntriesByEnvironment([a, b])).flat()).toHaveLength(2);
  });
});

describe("decodeT3TeamOutboxEntry", () => {
  it("round-trips a turn-start entry", () => {
    const original = entry({ kind: "turn-start" });
    expect(decodeT3TeamOutboxEntry(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it("round-trips a workflow-answer entry", () => {
    const original = entry({
      kind: "workflow-answer",
      payload: { messageId: "m", text: "answer", value: { choice: "a" }, correlationId: "c-1" },
    });
    expect(decodeT3TeamOutboxEntry(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it("rejects unknown kinds and malformed payloads", () => {
    const broken = entry({ kind: "turn-start" });
    expect(decodeT3TeamOutboxEntry({ ...broken, kind: "explode" })).toBeNull();
    expect(decodeT3TeamOutboxEntry({ ...broken, entryId: 42 })).toBeNull();
    expect(decodeT3TeamOutboxEntry({ ...broken, payload: { messageId: 1 } })).toBeNull();
    expect(
      decodeT3TeamOutboxEntry({
        ...broken,
        kind: "recipe-card-action",
        payload: { cardId: "card-1" },
      }),
    ).toBeNull();
    expect(decodeT3TeamOutboxEntry(null)).toBeNull();
    expect(decodeT3TeamOutboxEntry("nope")).toBeNull();
  });
});

describe("t3TeamOutboxRetryDelayMs", () => {
  it("follows the 1s..16s ladder", () => {
    expect(t3TeamOutboxRetryDelayMs(1)).toBe(1000);
    expect(t3TeamOutboxRetryDelayMs(2)).toBe(2000);
    expect(t3TeamOutboxRetryDelayMs(3)).toBe(4000);
    expect(t3TeamOutboxRetryDelayMs(10)).toBe(16000);
    expect(t3TeamOutboxRetryDelayMs(0)).toBe(1000);
  });
});

describe("isTransientT3TeamOutboxError", () => {
  it("treats transport-level socket errors as transient", () => {
    expect(isTransientT3TeamOutboxError(new Error("Socket is not connected"))).toBe(true);
    expect(isTransientT3TeamOutboxError(new Error("T3 server is not connected."))).toBe(true);
  });

  it("treats the t3team HTTP backend fetch failure as transient", () => {
    expect(
      isTransientT3TeamOutboxError(
        new Error(
          "Failed to reach backend /api/t3team/x at http://localhost:1. Fetch error: Failed to fetch.",
        ),
      ),
    ).toBe(true);
  });

  it("treats server-answered errors as permanent", () => {
    expect(isTransientT3TeamOutboxError(new Error("Request to /api/x failed with 400"))).toBe(
      false,
    );
    expect(
      isTransientT3TeamOutboxError(new Error("Thread 't' already has a turn in progress.")),
    ).toBe(false);
    expect(isTransientT3TeamOutboxError("plain string error")).toBe(false);
  });
});

describe("makeT3TeamOutboxEntry", () => {
  it("generates unique entry ids and captures the clock at creation", () => {
    const a = entry({ kind: "turn-start" });
    const b = entry({ kind: "turn-start" });
    expect(a.entryId).not.toBe(b.entryId);
    expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
    expect(a.environmentId).toBe("env-a");
    expect(a.threadId).toBe("thread-a");
  });
});

describe("t3TeamOutboxEntryPreview", () => {
  it("projects a preview per kind", () => {
    expect(t3TeamOutboxEntryPreview(entry({ kind: "turn-start" }))).toBe("hello");
    expect(
      t3TeamOutboxEntryPreview(
        entry({
          kind: "workflow-answer",
          payload: { messageId: "m", text: "yes", value: null, correlationId: null },
        }),
      ),
    ).toBe("yes");
    expect(
      t3TeamOutboxEntryPreview(
        entry({
          kind: "recipe-card-action",
          payload: { cardId: "c", actionId: "run", submit: null },
        }),
      ),
    ).toBe("run");
    expect(
      t3TeamOutboxEntryPreview(
        entry({
          kind: "staged-action",
          payload: {
            action: { selectedRecipe: { id: "r" }, comments: [] } as never,
            composerText: "",
            modelSelection: null,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          },
        }),
      ),
    ).toBe("staged action");
  });
});
