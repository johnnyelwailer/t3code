import { DEFAULT_PROVIDER_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  groupT3TeamOutboxEntriesByEnvironment,
  makeT3TeamOutboxEntry,
  type T3TeamOutboxSendIdentity,
} from "./t3team-outboxModel";
import { atSendTime } from "./t3team-outboxSendOrder";

function turnStart(text: string, createdAt: string, sendIdentity?: T3TeamOutboxSendIdentity) {
  const entry = makeT3TeamOutboxEntry(
    "turn-start",
    {
      messageId: `m-${text}`,
      messageText: text,
      modelSelection: null,
      titleSeed: text,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      createdAt,
      ...(sendIdentity ? { sendIdentity } : {}),
    },
    "env-a",
    "thread-a",
  );
  return atSendTime(entry, sendIdentity, createdAt);
}

// Replays nx-nexi nexi-work/send-confirmation.statechart, InOrder: the first message was sent,
// lost its reply and went to the outbox only after the second had been queued behind it.
describe("outbox send order", () => {
  it("InOrder: an unconfirmed send drains before a message queued while it waited", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-14T15:25:51.000Z"));
      const queuedSecond = turnStart("second", "2026-11-14T15:25:51.000Z");
      vi.setSystemTime(new Date("2026-11-14T15:27:50.000Z"));
      const handedFirst = turnStart("first", "2026-11-14T15:25:49.000Z", {
        commandId: "command-1",
        unconfirmed: true,
      });
      const queue = groupT3TeamOutboxEntriesByEnvironment([queuedSecond, handedFirst])["env-a"];
      expect(queue?.map((entry) => entry.entryId)).toEqual([
        handedFirst.entryId,
        queuedSecond.entryId,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
