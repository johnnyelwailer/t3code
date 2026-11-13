import { MessageId, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveMessagesTimelineRows } from "../../components/chat/MessagesTimeline.logic";
import type { TimelineEntry } from "../../session-logic";

const runId = RunId.make("run-report");
const report = `Befund: ${"Die Ursache liegt im Faltungsfilter der Zeitleiste. ".repeat(12)}`;

function say(id: string, role: "user" | "assistant", text: string, second: number): TimelineEntry {
  const at = `2026-11-13T09:00:${String(second).padStart(2, "0")}Z`;
  return {
    id,
    kind: "message",
    createdAt: at,
    message: {
      id: MessageId.make(id),
      role,
      text,
      runId: role === "user" ? null : runId,
      createdAt: at,
      updatedAt: at,
      streaming: false,
    },
  };
}

function work(id: string, second: number): TimelineEntry {
  const at = `2026-11-13T09:00:${String(second).padStart(2, "0")}Z`;
  return {
    id,
    kind: "work",
    createdAt: at,
    entry: { id, createdAt: at, runId, label: "Wrote report.md", tone: "tool" },
  };
}

describe("t3teamTurnReportIds in the settled timeline", () => {
  it("keeps a long mid-turn report outside the Worked for fold", () => {
    const rows = deriveMessagesTimelineRows({
      timelineEntries: [
        say("prompt", "user", "Analysiere den Fehler", 0),
        say("progress", "assistant", "Ich schaue mir die Datei an.", 1),
        work("read", 2),
        say("report", "assistant", report, 3),
        work("write", 4),
        say("closing", "assistant", "Bericht gespeichert.", 5),
      ],
      isWorking: false,
      activeTurnStartedAt: null,
      turnDiffSummaries: [],
      supportsConversationRollback: false,
    });

    expect(rows.map((row) => row.id)).toEqual([
      "prompt",
      "turn-fold:run-report",
      "report",
      "closing",
    ]);
  });
});
