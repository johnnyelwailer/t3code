/**
 * Primitive readers for Jira snapshot field values.
 *
 * `ResourceSnapshot.fields` is `Record<string, unknown>` by contract, and Jira is inconsistent
 * about whether a value arrives as a bare string or an object with a display name. These readers
 * absorb that so the composed field model in `t3team-workItemSnapshotFields.ts` stays declarative.
 */

export function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Jira sends people and named entities either as a plain string or as `{ displayName | name }`. */
export function readDisplayName(value: unknown): string | undefined {
  const direct = readString(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return readString(record.displayName) ?? readString(record.name) ?? readString(record.value);
}

export function readStringList(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value)) return [];
  const names = value.map((entry) => readDisplayName(entry)).filter((entry) => entry !== undefined);
  return names as ReadonlyArray<string>;
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readRecordList(value: unknown): ReadonlyArray<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => readRecord(entry) !== undefined);
}

/**
 * Normalises a Jira timestamp to epoch millis. Jira mixes ISO-8601 with offsets and, on some
 * endpoints, date-only strings; both parse correctly via `Date.parse`.
 */
export function readTimestampMs(value: unknown): number | undefined {
  const raw = readString(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type WorkItemPerson = {
  readonly displayName: string;
  readonly accountId?: string;
  readonly avatarUrl?: string;
  readonly email?: string;
};

/** Jira avatar URLs come as a size-keyed map; 48x48 is the largest guaranteed size. */
function readAvatarUrl(record: Record<string, unknown>): string | undefined {
  const direct = readString(record.avatarUrl);
  if (direct) return direct;
  const avatarUrls = readRecord(record.avatarUrls);
  if (!avatarUrls) return undefined;
  return (
    readString(avatarUrls["48x48"]) ??
    readString(avatarUrls["32x32"]) ??
    readString(avatarUrls["24x24"])
  );
}

export function readPerson(value: unknown): WorkItemPerson | undefined {
  const displayName = readDisplayName(value);
  if (!displayName) return undefined;

  const record = readRecord(value);
  if (!record) return { displayName };

  const accountId = readString(record.accountId);
  const avatarUrl = readAvatarUrl(record);
  const email = readString(record.emailAddress) ?? readString(record.email);

  return {
    displayName,
    ...(accountId ? { accountId } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(email ? { email } : {}),
  };
}
