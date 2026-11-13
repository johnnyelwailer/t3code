import { t3teamTurnReportIdsBy } from "@t3tools/client-runtime/t3team-turnReports";

/** Structural, so this module never imports threadActivity, which imports it. */
interface ReportFeedEntry {
  readonly id: string;
  readonly type: string;
  readonly message?: { readonly role: string; readonly text: string };
  readonly activities?: ReadonlyArray<{
    readonly workEntry: { readonly questionAnswer?: unknown };
  }>;
}

export const t3teamFeedReportIds = t3teamTurnReportIdsBy((entry: ReportFeedEntry) => ({
  id: entry.id,
  assistantText:
    entry.type === "message" && entry.message?.role === "assistant" ? entry.message.text : null,
  answersQuestion:
    entry.type === "activity-group" &&
    (entry.activities ?? []).some((activity) => activity.workEntry.questionAnswer !== undefined),
}));
