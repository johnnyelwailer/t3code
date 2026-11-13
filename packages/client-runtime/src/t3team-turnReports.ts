/**
 * Assistant messages a settled turn's "Worked for" fold leaves visible: reports long enough
 * to be read, and the message that led to a question the user answered. Provider-neutral.
 */
export const T3TEAM_TURN_REPORT_MIN_CHARS = 400;

export interface T3teamTurnReportEntry {
  readonly id: string;
  /** The assistant message text; null for every other entry. */
  readonly assistantText: string | null;
  readonly answersQuestion: boolean;
}

export function t3teamTurnReportIds(
  entries: ReadonlyArray<T3teamTurnReportEntry>,
): ReadonlySet<string> {
  const reportIds = new Set<string>();
  let lastAssistantId: string | null = null;
  for (const entry of entries) {
    if (entry.assistantText !== null) {
      lastAssistantId = entry.id;
      if (entry.assistantText.trim().length >= T3TEAM_TURN_REPORT_MIN_CHARS) {
        reportIds.add(entry.id);
      }
    } else if (entry.answersQuestion && lastAssistantId !== null) {
      reportIds.add(lastAssistantId);
    }
  }
  return reportIds;
}

/** Memoizes per entries array, so a fold loop can ask once per entry at no extra cost. */
export function t3teamTurnReportIdsBy<T>(
  toReportEntry: (entry: T) => T3teamTurnReportEntry,
): (entries: ReadonlyArray<T>) => ReadonlySet<string> {
  const cache = new WeakMap<ReadonlyArray<T>, ReadonlySet<string>>();
  return (entries) => {
    const cached = cache.get(entries);
    if (cached !== undefined) return cached;
    const reportIds = t3teamTurnReportIds(entries.map(toReportEntry));
    cache.set(entries, reportIds);
    return reportIds;
  };
}
