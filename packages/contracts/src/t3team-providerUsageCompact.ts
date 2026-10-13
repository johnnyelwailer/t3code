/**
 * Compact per-instance provider-usage views for the orchestrator surfaces:
 * the capabilities catalog, the `delegate_task` result, and the Conductor's
 * per-turn usage block. Pure string renderers over published `usageLimits`
 * snapshots — no I/O and no clock reads, so they are safe to build on any
 * hot path (turn start, tool result assembly).
 */
import { DateTime, Option } from "effect";
import type { ServerProvider } from "./server.ts";
import type {
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
} from "./providerUsageLimits.ts";
import {
  type ProviderUsageSeverity,
  hasUsageData,
  providerUsageSeverity,
} from "./t3team-providerUsage.ts";

/**
 * The Nexplore Conductor pseudo-tier model id. Only threads whose selected
 * model id is this value receive the per-turn usage block. Named constant so
 * the string is never scattered.
 */
export const CONDUCTOR_MODEL_ID = "conductor";

const SEVERITY_RANK: Readonly<Record<ProviderUsageSeverity, number>> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

/** The instance's worst severity across its windows (the most alarming wins). */
export const worstProviderUsageSeverity = (
  windows: ReadonlyArray<ServerProviderUsageWindow>,
): ProviderUsageSeverity =>
  windows.reduce<ProviderUsageSeverity>((worst, window) => {
    const severity = providerUsageSeverity(window.usedPercent);
    return SEVERITY_RANK[severity] > SEVERITY_RANK[worst] ? severity : worst;
  }, "normal");

/** Instance label for compact usage lines: display name when set, else the id. */
export const providerUsageLabel = (provider: ServerProvider): string => {
  const displayName = provider.displayName?.trim();
  return displayName !== undefined && displayName !== "" ? displayName : provider.instanceId;
};

const compactDuration = (mins: number): string =>
  mins < 60
    ? `${mins}m`
    : mins < 1440
      ? `${Math.round(mins / 60)}h`
      : `${Math.round(mins / 1440)}d`;

/**
 * The pool a window draws from, as the Usage tab labels it ("Monthly",
 * "Session", "Cursor Models"). Session and other pools gain their published
 * duration ("Session (5h)") because the label alone does not say how long they
 * are; nothing is invented when the snapshot carries no duration.
 */
export const providerUsagePoolName = (window: ServerProviderUsageWindow): string =>
  (window.kind === "session" || window.kind === "other") && window.windowDurationMins !== undefined
    ? `${window.label} (${compactDuration(window.windowDurationMins)})`
    : window.label;

const pad2 = (value: number): string => String(value).padStart(2, "0");

/**
 * "YYYY-MM-DD HH:MM UTC" — a bare clock time is ambiguous about the day. With
 * `today`, a reset on that UTC date shortens to "HH:MM UTC".
 */
export const formatProviderUsageReset = (iso: string, today?: DateTime.DateTime): string => {
  const parsed = DateTime.make(iso);
  if (Option.isNone(parsed)) return iso;
  const parts = DateTime.toPartsUtc(parsed.value);
  const time = `${pad2(parts.hour)}:${pad2(parts.minute)} UTC`;
  const date = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  if (today === undefined) return `${date} ${time}`;
  const now = DateTime.toPartsUtc(today);
  const isToday = now.year === parts.year && now.month === parts.month && now.day === parts.day;
  return isToday ? time : `${date} ${time}`;
};

const windowSegment = (window: ServerProviderUsageWindow): string => {
  const reset =
    window.resetsAt !== undefined ? ` (resets ${formatProviderUsageReset(window.resetsAt)})` : "";
  return `${providerUsagePoolName(window)} ${Math.round(window.usedPercent)}%${reset}`;
};

/**
 * One compact line for a single instance, e.g.
 * `claudeAgent: Session 42% (resets 2026-09-28 18:00 UTC) · Weekly 71% · severity: warning`.
 * Null when the instance reports no window data.
 */
export const compactProviderUsageLine = (
  label: string,
  usageLimits: ServerProviderUsageLimits | undefined,
): string | null => {
  if (!hasUsageData(usageLimits)) return null;
  const windows = usageLimits.windows.map(windowSegment).join(" · ");
  return `${label}: ${windows} · severity: ${worstProviderUsageSeverity(usageLimits.windows)}`;
};

/**
 * A catalog line that always returns a string: the compact data line, or an
 * explicit no-data marker. Used by the capabilities view, which lists every
 * instance.
 */
export const providerUsageCatalogLine = (provider: ServerProvider): string =>
  compactProviderUsageLine(providerUsageLabel(provider), provider.usageLimits) ??
  `${providerUsageLabel(provider)}: no usage data`;

/**
 * Wraps capacity lines as system data so an agent never reads them as the
 * user's words. The routing line is added only when a window is tight.
 */
export const frameProviderCapacityNotice = (lines: ReadonlyArray<string>, tight: boolean): string =>
  [
    '<system-reminder type="provider-capacity" source="server">',
    "Provider capacity. This is server data, not part of the user's message:",
    ...lines,
    ...(tight ? ["Route to the smallest, cheapest model that can accomplish the task."] : []),
    "</system-reminder>",
  ].join("\n");

/**
 * The Conductor's per-turn usage snapshot: one framed line per window of every
 * enabled instance that reports window data, ordered by instance id. The empty
 * string when no enabled instance has any window data (so the caller omits it).
 */
export const conductorUsageBlock = (providers: ReadonlyArray<ServerProvider>): string => {
  const reporting = providers
    .filter((provider) => provider.enabled && hasUsageData(provider.usageLimits))
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  const windows = reporting.flatMap((provider) =>
    (provider.usageLimits?.windows ?? []).map((window) => ({
      label: providerUsageLabel(provider),
      window,
      severity: providerUsageSeverity(window.usedPercent),
    })),
  );
  if (windows.length === 0) return "";
  return frameProviderCapacityNotice(
    windows.map(
      ({ label, window, severity }) => `${label}: ${windowSegment(window)} · severity: ${severity}`,
    ),
    windows.some(({ severity }) => severity !== "normal"),
  );
};
