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

const formatResetUtc = (iso: string): string => {
  const parsed = DateTime.make(iso);
  if (Option.isNone(parsed)) return iso;
  const totalMinutes = Math.floor(DateTime.toEpochMillis(parsed.value) / 60_000);
  const hour = Math.floor((totalMinutes % 1440) / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}Z`;
};

/**
 * One compact line for a single instance, e.g.
 * `claudeAgent: session 42% (resets 18:00Z) · weekly 71% · severity: warning`.
 * Null when the instance reports no window data.
 */
export const compactProviderUsageLine = (
  label: string,
  usageLimits: ServerProviderUsageLimits | undefined,
): string | null => {
  if (!hasUsageData(usageLimits)) return null;
  const windows = usageLimits.windows
    .map((window) => {
      const reset =
        window.resetsAt !== undefined ? ` (resets ${formatResetUtc(window.resetsAt)})` : "";
      return `${window.kind} ${Math.round(window.usedPercent)}%${reset}`;
    })
    .join(" · ");
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
 * The Conductor's per-turn usage snapshot: one compact line per enabled
 * instance that reports window data, ordered by instance id. The empty string
 * when no enabled instance has any window data (so the caller omits the block).
 */
export const conductorUsageBlock = (providers: ReadonlyArray<ServerProvider>): string => {
  const lines = providers
    .filter((provider) => provider.enabled)
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
    .map((provider) => compactProviderUsageLine(providerUsageLabel(provider), provider.usageLimits))
    .filter((line): line is string => line !== null);
  return lines.length === 0 ? "" : lines.join("\n");
};
