import type { CloudSession } from "@t3tools/contracts";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { SelectItem } from "../ui/select";
import { presentCloudSession } from "./t3team-cloudSessionProvisionPresentation";
import type { RunOnCloudRow as Row } from "./t3team-runOnCloudRows";

const ROW_CLASS = "flex w-full items-start gap-1.5 rounded-sm px-2 py-1.5 sm:text-sm";

/** What the machine is doing, under its name: "Ready · ubuntu-slim · 12 GB · 4 cores". */
function rowDetail(session: CloudSession): string {
  const presentation = presentCloudSession(session);
  return `${presentation.title} · ${presentation.detail}`;
}

/** After this long, "Connecting…" admits it is slower than usual. */
const SLOW_CONNECT_MS = 20_000;

/** "Connecting… 12s", ticking each second so a stuck connect is distinguishable from a working one. */
export function connectingDetail(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const base = `Connecting… ${seconds}s`;
  return elapsedMs >= SLOW_CONNECT_MS ? `${base} · taking longer than usual` : base;
}

function useElapsedMs(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? 0 : now - since;
}

/**
 * One cloud machine in the "Run on" list. Connected: a choice like any machine. Ready but not yet
 * connected: clicking connects it and runs the thread there. Still coming up: read-only, with a
 * dismiss on a failure.
 */
export function RunOnCloudRow(props: {
  readonly row: Row;
  readonly selectable: boolean;
  readonly connecting: boolean;
  /** When the connect began (ms epoch); drives the elapsed time. */
  readonly connectingSince?: number | null;
  /** Why the last connect failed; the row offers a retry instead of hanging. */
  readonly connectError?: string | null;
  readonly onCancelConnect?: () => void;
  readonly onConnect: (session: CloudSession) => void;
  readonly onDismiss: ((session: CloudSession) => void) | undefined;
}) {
  const { row, connecting, connectError = null } = props;
  const { session } = row;
  const elapsedMs = useElapsedMs(connecting ? (props.connectingSince ?? null) : null);
  if (row.environment !== null && props.selectable) {
    return (
      <SelectItem value={row.environment.environmentId}>
        <span className="flex min-w-0 items-start gap-1.5">
          <EnvironmentMachineIcon kind="cloud" className="mt-1 size-3 shrink-0" />
          <RowText title={row.name} detail={rowDetail(session)} />
        </span>
      </SelectItem>
    );
  }
  if (session.phase === "ready" && row.environment === null && !row.unavailable) {
    const detail = connecting
      ? props.connectingSince == null
        ? "Connecting…"
        : connectingDetail(elapsedMs)
      : connectError !== null
        ? `Couldn't connect: ${connectError} Click to retry.`
        : rowDetail(session);
    return (
      <div className="flex w-full items-start">
        <button
          type="button"
          disabled={connecting}
          aria-busy={connecting}
          onClick={() => props.onConnect(session)}
          className={cn(
            ROW_CLASS,
            "min-w-0 flex-1",
            connecting
              ? "cursor-default text-muted-foreground"
              : "cursor-pointer text-foreground hover:bg-muted",
          )}
        >
          <EnvironmentMachineIcon
            kind="cloud"
            className={cn("mt-1 size-3 shrink-0", connecting && "animate-pulse")}
          />
          <RowText title={row.name} detail={detail} />
        </button>
        {connecting && props.onCancelConnect ? (
          <button
            type="button"
            onClick={props.onCancelConnect}
            className="mt-1.5 mr-1 shrink-0 cursor-pointer rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs hover:bg-muted/60 hover:text-foreground"
          >
            Cancel
          </button>
        ) : null}
      </div>
    );
  }
  const working = presentCloudSession(session).tone === "working";
  return (
    <div className={cn(ROW_CLASS, "text-muted-foreground")}>
      <EnvironmentMachineIcon
        kind="cloud"
        className={cn("mt-1 size-3 shrink-0", working && "animate-pulse")}
      />
      <RowText
        title={row.name}
        detail={row.unavailable ? "Doesn't have this project" : rowDetail(session)}
      />
      {session.phase === "failed" && props.onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => props.onDismiss?.(session)}
          className="-mr-1 shrink-0 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <XIcon className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** The name over what it is doing, so a narrow menu truncates the detail, never the name. */
function RowText({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-start text-left">
      <span className="max-w-full truncate">{title}</span>
      <span className="max-w-full truncate text-muted-foreground text-xs">{detail}</span>
    </span>
  );
}
