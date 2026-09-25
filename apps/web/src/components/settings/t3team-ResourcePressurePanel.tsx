/**
 * Memory-pressure view inside Settings → Diagnostics (flag
 * `NEXI_FF_RESOURCE_PRESSURE`, advertised as `ServerConfig.resourcePressure`;
 * the parent mounts this only when it is on). Shows the level, host + app
 * totals, the top T3 processes, the persisted pressure history, and one safe
 * action: stop a process by its exact PID + start time, after confirmation.
 */
import type { EnvironmentId, ResourcePressureConsumer } from "@t3tools/contracts";
import { GaugeIcon } from "lucide-react";
import * as Option from "effect/Option";
import { useCallback, useEffect, useState } from "react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { cn } from "../../lib/utils";
import { ensureLocalApi } from "../../localApi";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTime } from "../../timestampFormat";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { toastManager } from "../ui/toast";
import { SettingsSection, useRelativeTimeTick } from "./settingsLayout";
import {
  PRESSURE_LEVEL_LABEL,
  PRESSURE_LEVEL_TONE,
  availablePercent,
  canOfferStop,
  describePressureEvent,
  formatPressureBytes,
  panelRefreshIntervalMs,
  stopConfirmMessage,
} from "./t3team-ResourcePressurePanel.logic";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function Ago({ at }: { at: number }) {
  useRelativeTimeTick();
  const relative = formatRelativeTime(new Date(at).toISOString());
  return (
    <span className="tabular-nums">
      {relative ? `${relative.value} ${relative.suffix ?? ""}` : "—"}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground/70">{label}</div>
      <div className="truncate font-mono text-sm tabular-nums">{value}</div>
      {hint ? <div className="truncate text-[11px] text-muted-foreground/60">{hint}</div> : null}
    </div>
  );
}

export function ResourcePressurePanel({ environmentId }: { environmentId: EnvironmentId }) {
  const query = useEnvironmentQuery(
    serverEnvironment.resourcePressure({ environmentId, input: {} }),
  );
  const signalProcess = useAtomCommand(serverEnvironment.signalProcess, { reportFailure: false });
  const [stoppingPid, setStoppingPid] = useState<number | null>(null);
  const snapshot = query.data?.snapshot ?? null;
  const { refresh } = query;
  const intervalMs = panelRefreshIntervalMs(snapshot?.sampleIntervalMs);

  // Bounded re-read of the server's latest sample while the panel is mounted.
  useEffect(() => {
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  const stop = useCallback(
    async (consumer: ResourcePressureConsumer) => {
      if (!canOfferStop(consumer) || stoppingPid !== null) return;
      const confirmed = await ensureLocalApi()
        .dialogs.confirm(stopConfirmMessage(consumer), { variant: "destructive" })
        .catch(() => false);
      if (!confirmed) return;
      setStoppingPid(consumer.pid);
      const result = await signalProcess({
        environmentId,
        input: { pid: consumer.pid, startTimeMs: consumer.startTimeMs, signal: "SIGINT" },
      });
      setStoppingPid(null);
      const message =
        result._tag === "Failure"
          ? errorMessage(squashAtomCommandFailure(result))
          : result.value.signaled
            ? null
            : Option.getOrElse(result.value.message, () => "The process was not signaled.");
      if (message !== null) {
        toastManager.add({
          type: "error",
          title: `Could not stop ${consumer.pid}`,
          description: message,
        });
      }
      refresh();
    },
    [environmentId, refresh, signalProcess, stoppingPid],
  );

  return (
    <SettingsSection
      title="Memory pressure"
      icon={<GaugeIcon className="size-4 text-muted-foreground" />}
      headerAction={
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
          {snapshot ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                PRESSURE_LEVEL_TONE[snapshot.level],
              )}
            >
              {PRESSURE_LEVEL_LABEL[snapshot.level]}
            </span>
          ) : null}
          {snapshot ? <Ago at={snapshot.sampledAt} /> : <span>Waiting for first sample</span>}
          <Button
            size="icon-micro"
            variant="ghost"
            onClick={refresh}
            aria-label="Refresh memory pressure"
          >
            <RefreshIcon className="size-3" refreshing={query.isPending} />
          </Button>
        </div>
      }
    >
      {query.error ? <p className="text-xs text-destructive">{query.error}</p> : null}
      {snapshot ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stat
              label="System memory available"
              value={`${formatPressureBytes(snapshot.availableMemoryBytes)} of ${formatPressureBytes(snapshot.totalMemoryBytes)}`}
              hint={`${availablePercent(snapshot.availableMemoryBytes, snapshot.totalMemoryBytes)}% free`}
            />
            <Stat
              label="Nexi Work (all processes)"
              value={formatPressureBytes(snapshot.appTreeRssBytes)}
              hint={`${snapshot.appTreeProcessCount} processes`}
            />
            <Stat label="macOS memory pressure" value={snapshot.osLevel ?? "not available"} />
          </div>
          <p className="text-xs text-muted-foreground">
            {snapshot.recommendation}
            {snapshot.reasons.length > 0 ? ` (${snapshot.reasons.join("; ")})` : ""}
          </p>
          <ul className="divide-y divide-border/50 rounded-lg border border-border/60 text-xs">
            {snapshot.topConsumers.map((consumer) => (
              <li
                key={`${consumer.pid}:${consumer.startTimeMs}`}
                className="flex items-center gap-3 px-3 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate" title={consumer.command}>
                  {consumer.name || consumer.command || "unknown"}
                  <span className="ml-2 text-muted-foreground/60">
                    {consumer.category} · pid {consumer.pid}
                  </span>
                </span>
                <span className="font-mono tabular-nums">
                  {formatPressureBytes(consumer.residentBytes)}
                </span>
                <span className="w-12 text-right font-mono tabular-nums text-muted-foreground">
                  {Math.round(consumer.cpuPercent)}%
                </span>
                {canOfferStop(consumer) ? (
                  <Button
                    size="micro"
                    variant="ghost"
                    disabled={stoppingPid !== null}
                    onClick={() => void stop(consumer)}
                  >
                    Stop…
                  </Button>
                ) : (
                  <span className="w-12" />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {query.data && query.data.recentEvents.length > 0 ? (
        <div className="space-y-1 text-xs">
          <div className="text-[11px] text-muted-foreground/70">Recent pressure changes</div>
          {query.data.recentEvents.map((event) => (
            <div key={event.id} className="flex gap-3">
              <span className="w-24 shrink-0 text-muted-foreground/60">
                <Ago at={event.occurredAt} />
              </span>
              <span className="min-w-0 truncate">{describePressureEvent(event)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </SettingsSection>
  );
}
