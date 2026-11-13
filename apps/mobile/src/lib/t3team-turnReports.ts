import { t3teamTurnReportIdsBy } from "@t3tools/client-runtime/t3team-turnReports";

import type { ThreadFeedEntry } from "./threadActivity";

export const t3teamFeedReportIds = t3teamTurnReportIdsBy((entry: ThreadFeedEntry) => ({
  id: entry.id,
  assistantText:
    entry.type === "message" && entry.message.role === "assistant" ? entry.message.text : null,
  answersQuestion:
    entry.type === "activity-group" &&
    entry.activities.some((activity) => activity.workEntry.questionAnswer !== undefined),
}));
