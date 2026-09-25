/**
 * Memory-pressure view inside Settings → Diagnostics (flag
 * `NEXI_FF_RESOURCE_PRESSURE`, advertised as `ServerConfig.resourcePressure`;
 * the parent mounts this only when it is on). Shows the level, the machine /
 * app / spawned / rest-of-machine split, the top T3 processes, worktree
 * accumulation, the persisted pressure history, and two safe actions: stop a
 * process by its exact PID + start time, and run the configured storage sweep
 * now — both after confirmation.
 */
import type { EnvironmentId, ResourcePressureConsumer } from "@t3tools/contracts";
import { GaugeIcon } from "lucide-react";
import * as Option from "effect/Option";
import { useEffect, useRef, useState } from "react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { cn } from "../../lib/utils";
import { ensureLocalApi } from "../../localApi";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { toastManager } from "../ui/toast";
import { SettingsSection } from "./settingsLayout";
import {
  PRESSURE_LEVEL_LABEL,
  PRESSURE_LEVEL_TONE,
  panelRefreshIntervalMs,
  stopConfirmMessage,
  SWEEP_CONFIRM_MESSAGE,
} from "./t3team-ResourcePressurePanel.logic";
import {
  Ago,
  PressureEventList,
  PressureStats,
  TopProcessList,
} from "./t3team-ResourcePressureParts";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const confirmAction = (message: string) =>
  ensureLocalApi()
    .dialogs.confirm(message, { variant: "destructive" })
    .catch(() => false);

export function ResourcePressurePanel({ environmentId }: { environmentId: EnvironmentId }) {
  const query = useEnvironmentQuery(
    serverEnvironment.resourcePressure({ environmentId, input: {} }),
  );
  const signalProcess = useAtomCommand(serverEnvironment.signalProcess, { reportFailure: false });
  const sweepStorage = useAtomCommand(serverEnvironment.sweepStorageNow, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  // Guards the whole confirm → act sequence, so a double click cannot queue a second action.
  const busyRef = useRef(false);
  const snapshot = query.data?.snapshot ?? null;
  const { refresh } = query;
  const intervalMs = panelRefreshIntervalMs(snapshot?.sampleIntervalMs);

  // Bounded re-read of the server's latest sample while the panel is mounted.
  useEffect(() => {
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  const runGuarded = async (
    confirmMessage: string,
    act: () => Promise<string | null>,
    failTitle: string,
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (!(await confirmAction(confirmMessage))) return;
      const failure = await act();
      if (failure !== null) {
        toastManager.add({ type: "error", title: failTitle, description: failure });
      }
      refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const stop = (consumer: ResourcePressureConsumer) =>
    void runGuarded(
      stopConfirmMessage(consumer),
      async () => {
        const result = await signalProcess({
          environmentId,
          input: { pid: consumer.pid, startTimeMs: consumer.startTimeMs, signal: "SIGINT" },
        });
        if (result._tag === "Failure") return errorMessage(squashAtomCommandFailure(result));
        return result.value.signaled
          ? null
          : Option.getOrElse(result.value.message, () => "The process was not signaled.");
      },
      `Could not stop ${consumer.pid}`,
    );

  const sweep = () =>
    void runGuarded(
      SWEEP_CONFIRM_MESSAGE,
      async () => {
        const result = await sweepStorage({ environmentId, input: {} });
        if (result._tag === "Failure") return errorMessage(squashAtomCommandFailure(result));
        return result.value.swept ? null : result.value.message;
      },
      "Storage sweep did not run",
    );

  const accumulation = snapshot?.accumulation ?? null;
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
          <PressureStats snapshot={snapshot} />
          <p className="text-xs text-muted-foreground">
            {snapshot.recommendation}
            {snapshot.reasons.length > 0 ? ` (${snapshot.reasons.join("; ")})` : ""}
          </p>
          <TopProcessList consumers={snapshot.topConsumers} stopping={busy} onStop={stop} />
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {accumulation === null
                ? "Worktree count unavailable"
                : `${accumulation.worktreeThreadCount} threads own a worktree · ${accumulation.archivedWorktreeThreadCount} archived`}
            </span>
            <Button size="micro" variant="outline" disabled={busy} onClick={sweep}>
              Sweep now…
            </Button>
          </div>
        </div>
      ) : null}
      <PressureEventList events={query.data?.recentEvents ?? []} />
    </SettingsSection>
  );
}
