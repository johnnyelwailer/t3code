/**
 * Presentational pieces of the memory-pressure panel (split out of
 * `t3team-ResourcePressurePanel.tsx`): stat tiles, the process-class breakdown,
 * the top-process list and the pressure-change history. No data fetching.
 */
import type {
  ResourcePressureConsumer,
  ResourcePressureEvent,
  ResourcePressureSnapshot,
} from "@t3tools/contracts";

import { formatRelativeTime } from "../../timestampFormat";
import { Button } from "../ui/button";
import { useRelativeTimeTick } from "./settingsLayout";
import {
  availablePercent,
  canOfferStop,
  describePressureEvent,
  formatPressureBytes,
} from "./t3team-ResourcePressurePanel.logic";

export function Ago({ at }: { at: number }) {
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

/** Machine, app itself, what the app spawned, and everything else — kept apart on purpose. */
export function PressureStats({ snapshot }: { snapshot: ResourcePressureSnapshot }) {
  const { appProper, appSpawned, restOfMachineBytes } = snapshot.classes;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="System memory available"
        value={`${formatPressureBytes(snapshot.availableMemoryBytes)} of ${formatPressureBytes(snapshot.totalMemoryBytes)}`}
        hint={`${availablePercent(snapshot.availableMemoryBytes, snapshot.totalMemoryBytes)}% free · macOS ${snapshot.osLevel ?? "n/a"}`}
      />
      <Stat
        label="Nexi Work itself"
        value={formatPressureBytes(appProper.rssBytes)}
        hint={`server ${formatPressureBytes(appProper.serverRssBytes)} · window ${formatPressureBytes(appProper.rendererRssBytes)}`}
      />
      <Stat
        label="Agents & terminals it started"
        value={formatPressureBytes(appSpawned.rssBytes)}
        hint={`${appSpawned.agentSessionCount} agent sessions · ${appSpawned.agentSpawnedProcessCount} child processes`}
      />
      <Stat
        label="Rest of this machine"
        value={formatPressureBytes(restOfMachineBytes)}
        hint="other apps and tools"
      />
    </div>
  );
}

export function TopProcessList(props: {
  consumers: ReadonlyArray<ResourcePressureConsumer>;
  stopping: boolean;
  onStop: (consumer: ResourcePressureConsumer) => void;
}) {
  return (
    <ul className="divide-y divide-border/50 rounded-lg border border-border/60 text-xs">
      {props.consumers.map((consumer) => (
        <li
          key={`${consumer.pid}:${consumer.startTimeMs}`}
          className="flex items-center gap-3 px-3 py-1.5"
        >
          <span className="min-w-0 flex-1 truncate">
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
              disabled={props.stopping}
              onClick={() => props.onStop(consumer)}
            >
              Stop…
            </Button>
          ) : (
            <span className="w-12" />
          )}
        </li>
      ))}
    </ul>
  );
}

export function PressureEventList({ events }: { events: ReadonlyArray<ResourcePressureEvent> }) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-1 text-xs">
      <div className="text-[11px] text-muted-foreground/70">Recent pressure changes</div>
      {events.map((event) => (
        <div key={event.id} className="flex gap-3">
          <span className="w-24 shrink-0 text-muted-foreground/60">
            <Ago at={event.occurredAt} />
          </span>
          <span className="min-w-0 truncate">{describePressureEvent(event)}</span>
        </div>
      ))}
    </div>
  );
}
