import { MessageId, ThreadId, type T3TeamThreadArtifact } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyT3TeamThreadArtifactsEvent,
  EMPTY_T3TEAM_THREAD_ARTIFACTS,
  supportsT3TeamThreadArtifacts,
} from "./t3team-threadArtifacts.ts";

const THREAD_ID = ThreadId.make("thread-1");

function artifact(
  id: string,
  createdAt: string,
  patch: Partial<T3TeamThreadArtifact> = {},
): T3TeamThreadArtifact {
  return {
    id,
    threadId: THREAD_ID,
    messageId: null,
    kind: "widget",
    payload: { id },
    createdAt,
    updatedAt: createdAt,
    ...patch,
  };
}

const ids = (artifacts: ReadonlyArray<T3TeamThreadArtifact>) => artifacts.map(({ id }) => id);

describe("applyT3TeamThreadArtifactsEvent", () => {
  it("orders a snapshot by createdAt, then id for equal instants", () => {
    const state = applyT3TeamThreadArtifactsEvent(EMPTY_T3TEAM_THREAD_ARTIFACTS, {
      type: "snapshot",
      threadId: THREAD_ID,
      artifacts: [
        artifact("widget:c", "2026-10-03T10:00:02.000Z"),
        artifact("widget:b", "2026-10-03T10:00:01.000Z"),
        artifact("widget:a", "2026-10-03T10:00:01.000Z"),
      ],
    });

    expect(ids(state)).toEqual(["widget:a", "widget:b", "widget:c"]);
  });

  it("replaces an upserted artifact in place of its old version and keeps timeline order", () => {
    const before = applyT3TeamThreadArtifactsEvent(EMPTY_T3TEAM_THREAD_ARTIFACTS, {
      type: "snapshot",
      threadId: THREAD_ID,
      artifacts: [
        artifact("draft-a", "2026-10-03T10:00:01.000Z", { kind: "draft-mutation" }),
        artifact("widget:b", "2026-10-03T10:00:03.000Z"),
      ],
    });

    const updated = applyT3TeamThreadArtifactsEvent(before, {
      type: "upsert",
      artifact: artifact("draft-a", "2026-10-03T10:00:01.000Z", {
        kind: "draft-mutation",
        payload: { status: "applied" },
        updatedAt: "2026-10-03T10:05:00.000Z",
      }),
    });
    expect(ids(updated)).toEqual(["draft-a", "widget:b"]);
    expect(updated[0]?.payload).toEqual({ status: "applied" });

    const inserted = applyT3TeamThreadArtifactsEvent(updated, {
      type: "upsert",
      artifact: artifact("card:m", "2026-10-03T10:00:02.000Z", {
        kind: "pack.card",
        messageId: MessageId.make("message-1"),
      }),
    });
    expect(ids(inserted)).toEqual(["draft-a", "card:m", "widget:b"]);
  });

  it("drops a removed artifact and keeps the list identity for an unknown id", () => {
    const before = applyT3TeamThreadArtifactsEvent(EMPTY_T3TEAM_THREAD_ARTIFACTS, {
      type: "snapshot",
      threadId: THREAD_ID,
      artifacts: [
        artifact("a", "2026-10-03T10:00:01.000Z"),
        artifact("b", "2026-10-03T10:00:02.000Z"),
      ],
    });

    const removed = applyT3TeamThreadArtifactsEvent(before, {
      type: "removed",
      threadId: THREAD_ID,
      artifactId: "a",
    });
    expect(ids(removed)).toEqual(["b"]);

    const unchanged = applyT3TeamThreadArtifactsEvent(removed, {
      type: "removed",
      threadId: THREAD_ID,
      artifactId: "missing",
    });
    expect(unchanged).toBe(removed);
  });
});

describe("supportsT3TeamThreadArtifacts", () => {
  it("requires the server to advertise the flag", () => {
    expect(supportsT3TeamThreadArtifacts(undefined)).toBe(false);
    expect(supportsT3TeamThreadArtifacts({ threadFacts: true })).toBe(false);
    expect(supportsT3TeamThreadArtifacts({ threadArtifacts: true })).toBe(true);
  });
});
