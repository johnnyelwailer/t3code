import type {
  ResourcePressureConsumer,
  ResourcePressureEvent,
  ResourcePressureLevel,
} from "@t3tools/contracts";

/** The panel re-reads the server's latest sample at the sample period, never faster than 10 s. */
export const MIN_PANEL_REFRESH_MS = 10_000;

export function panelRefreshIntervalMs(sampleIntervalMs: number | null | undefined): number {
  return Math.max(MIN_PANEL_REFRESH_MS, sampleIntervalMs ?? 20_000);
}

export const PRESSURE_LEVEL_LABEL: Record<ResourcePressureLevel, string> = {
  ok: "OK",
  warn: "Getting short",
  critical: "Critical",
};

export const PRESSURE_LEVEL_TONE: Record<ResourcePressureLevel, string> = {
  ok: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  critical: "bg-red-500/12 text-red-700 dark:text-red-400",
};

export function formatPressureBytes(value: number): string {
  const gib = value / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(gib >= 10 ? 0 : 1)} GB`;
  return `${Math.round(value / 1024 ** 2)} MB`;
}

export function availablePercent(available: number, total: number): number {
  return total > 0 ? Math.round((available / total) * 100) : 0;
}

export function describePressureEvent(event: ResourcePressureEvent): string {
  const top =
    event.topProcessName === null
      ? ""
      : ` · top: ${event.topProcessName} ${formatPressureBytes(event.topProcessRssBytes)}`;
  return `${PRESSURE_LEVEL_LABEL[event.fromLevel]} → ${PRESSURE_LEVEL_LABEL[event.toLevel]} · app ${formatPressureBytes(event.appTreeRssBytes)}${top}`;
}

/**
 * Only processes the server would accept a signal for get a Stop action, and
 * only by their exact PID + start time (the server re-checks both). Never a
 * name or pattern match.
 */
export function canOfferStop(consumer: ResourcePressureConsumer): boolean {
  return consumer.signalable;
}

export function stopConfirmMessage(consumer: ResourcePressureConsumer): string {
  return (
    `Stop process ${consumer.pid} (${consumer.name || "unknown"}, ` +
    `${formatPressureBytes(consumer.residentBytes)})? It receives SIGINT (like Ctrl-C) and can clean up; ` +
    "any agent or terminal running in it ends."
  );
}

export const SWEEP_CONFIRM_MESSAGE =
  "Run the storage sweep now? It applies your configured cleanup rules (worktree cleanup, " +
  "browser artifacts, rotated logs) immediately instead of at the next hourly pass. " +
  "Nothing outside those rules is removed.";
