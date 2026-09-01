import { isJsonObject, joinJsonl, parseJsonObject, splitJsonl } from "./CodexHistoryRepairJsonl.ts";

/**
 * Provider history is retained as evidence. Only unsupported sub-agent
 * activity metadata is removed; transcript and work records stay untouched.
 * The resume decoder supplies its accepted kinds when healing an error. The
 * default includes Codex 0.150's supported `completed` marker.
 */
export const CODEX_HISTORY_REPAIR_POLICY = "sub-agent-activity-unsupported-kind-drop-v2" as const;
export const CURRENT_CODEX_ACTIVITY_KINDS = [
  "started",
  "interacted",
  "interrupted",
  "completed",
] as const;

export interface CodexHistoryRepairFinding {
  readonly action: "drop";
  readonly line: number;
  readonly itemId?: string;
  readonly previousKind: string;
  readonly reason: string;
}

export interface CodexHistoryFileScan {
  readonly filePath: string;
  readonly matchedThread: boolean;
  readonly originalContents: string;
  readonly repairedContents: string;
  readonly findings: ReadonlyArray<CodexHistoryRepairFinding>;
  readonly unsafeReasons: ReadonlyArray<string>;
}

interface ActivityLocation {
  readonly payload: Record<string, unknown>;
  readonly item: Record<string, unknown>;
}

function normalizeActivityType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function activityLocation(record: Record<string, unknown>): ActivityLocation | undefined {
  const payload = record.payload;
  if (!isJsonObject(payload) || !isJsonObject(payload.item)) return undefined;
  if (normalizeActivityType(payload.item.type) !== "subagentactivity") return undefined;
  return { payload, item: payload.item };
}

function recordThreadIds(record: Record<string, unknown>): ReadonlyArray<string> {
  const payload = record.payload;
  if (!isJsonObject(payload)) return [];

  const ids: Array<string> = [];
  if (record.type === "session_meta" && typeof payload.id === "string") ids.push(payload.id);
  for (const key of ["thread_id", "threadId"]) {
    const value = payload[key];
    if (typeof value === "string") ids.push(value);
  }
  return ids;
}

function unsupportedActivityFinding(
  item: Record<string, unknown>,
  line: number,
): CodexHistoryRepairFinding {
  const rawKind = item.kind;
  const previousKind = typeof rawKind === "string" ? rawKind : "<missing>";
  const itemId = typeof item.id === "string" ? item.id : undefined;
  return {
    action: "drop",
    line,
    ...(itemId ? { itemId } : {}),
    previousKind,
    reason:
      "Unsupported sub-agent activity metadata is not representable by the selected app-server contract; dropping only this metadata record preserves transcript/work records.",
  };
}

function replacementForActivity(
  location: ActivityLocation,
  line: number,
  supportedKinds: ReadonlySet<string>,
): { readonly finding?: CodexHistoryRepairFinding; readonly drop: boolean } {
  const rawKind = location.item.kind;
  const canonicalKind = typeof rawKind === "string" ? rawKind.toLowerCase() : "";
  if (supportedKinds.has(canonicalKind)) return { drop: false };
  return { finding: unsupportedActivityFinding(location.item, line), drop: true };
}

/**
 * Scan one rollout without touching the filesystem. Unchanged lines remain
 * byte-for-byte identical. Invalid JSON makes the matching file unsafe and
 * is never changed automatically.
 */
export function scanCodexRolloutFile(
  filePath: string,
  contents: string,
  providerThreadId: string,
  supportedActivityKinds: ReadonlyArray<string> = CURRENT_CODEX_ACTIVITY_KINDS,
): CodexHistoryFileScan {
  const { lines, newline, trailingNewline } = splitJsonl(contents);
  const repairedLines: Array<string | undefined> = [...lines];
  const findings: Array<CodexHistoryRepairFinding> = [];
  const unsafeReasons: Array<string> = [];
  const supportedKinds = new Set(supportedActivityKinds.map((kind) => kind.toLowerCase()));
  let matchedThread = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) return;

    const record = parseJsonObject(line);
    if (!record) {
      unsafeReasons.push(`Line ${lineNumber} is not a JSON object.`);
      return;
    }
    const recordIds = recordThreadIds(record);
    if (recordIds.includes(providerThreadId)) matchedThread = true;

    const location = activityLocation(record);
    if (!location) return;
    if (recordIds.length > 0 && !recordIds.includes(providerThreadId)) return;
    const replacement = replacementForActivity(location, lineNumber, supportedKinds);
    if (replacement.finding) findings.push(replacement.finding);
    if (replacement.drop) repairedLines[index] = undefined;
  });

  if (!matchedThread) {
    return {
      filePath,
      matchedThread: false,
      originalContents: contents,
      repairedContents: contents,
      findings: [],
      unsafeReasons: [],
    };
  }

  return {
    filePath,
    matchedThread: true,
    originalContents: contents,
    repairedContents: joinJsonl(repairedLines, newline, trailingNewline),
    findings,
    unsafeReasons,
  };
}
