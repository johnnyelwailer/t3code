import { t3teamTurnReportIdsBy } from "@t3tools/client-runtime/t3team-turnReports";

import type { TimelineEntry } from "../../session-logic";

export const t3teamTimelineReportIds = t3teamTurnReportIdsBy((entry: TimelineEntry) => ({
  id: entry.id,
  assistantText:
    entry.kind === "message" && entry.message.role === "assistant" ? entry.message.text : null,
  answersQuestion: entry.kind === "work" && entry.entry.questionAnswer !== undefined,
}));
