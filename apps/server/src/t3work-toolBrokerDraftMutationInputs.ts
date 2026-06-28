export type DraftToolContext = {
  readonly state: unknown;
};

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function readNullableNumber(
  record: Record<string, unknown>,
  key: string,
): number | null | undefined {
  if (!(key in record)) return undefined;
  return record[key] === null ? null : readNonNegativeNumber(record[key]);
}

export function readNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in record)) return undefined;
  return record[key] === null ? null : readTrimmedString(record[key]);
}

function readContextIssueId(context: DraftToolContext): string | undefined {
  const state = readRecord(context.state);
  const nestedState = readRecord(state?.state);
  const view = readRecord(state?.view) ?? readRecord(nestedState?.view);
  const workItem = readRecord(state?.workItem) ?? readRecord(nestedState?.workItem);
  return (
    readTrimmedString(view?.ticketDisplayId) ??
    readTrimmedString(view?.ticketId) ??
    readTrimmedString(workItem?.displayId) ??
    readTrimmedString(workItem?.id)
  );
}

export function readIssueId(
  args: Record<string, unknown>,
  context: DraftToolContext,
): string | undefined {
  return (
    readTrimmedString(args.issue_id) ??
    readTrimmedString(args.issueId) ??
    readTrimmedString(args.issueIdOrKey) ??
    readTrimmedString(args.work_item_id) ??
    readContextIssueId(context)
  );
}
