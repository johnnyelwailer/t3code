import type { CloudSession } from "@t3tools/contracts";
import { XIcon } from "lucide-react";

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

/**
 * One cloud machine in the "Run on" list. Connected: a choice like any machine. Ready but not yet
 * connected: clicking connects it and runs the thread there. Still coming up: read-only, with a
 * dismiss on a failure.
 */
export function RunOnCloudRow(props: {
  readonly row: Row;
  readonly selectable: boolean;
  readonly connecting: boolean;
  readonly onConnect: (session: CloudSession) => void;
  readonly onDismiss: ((session: CloudSession) => void) | undefined;
}) {
  const { row, connecting } = props;
  const { session } = row;
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
  if (session.phase === "ready" && row.environment === null && (!row.unavailable || connecting)) {
    return (
      <button
        type="button"
        disabled={connecting}
        onClick={() => props.onConnect(session)}
        className={cn(
          ROW_CLASS,
          connecting
            ? "cursor-default text-muted-foreground"
            : "cursor-pointer text-foreground hover:bg-muted",
        )}
      >
        <EnvironmentMachineIcon
          kind="cloud"
          className={cn("mt-1 size-3 shrink-0", connecting && "animate-pulse")}
        />
        <RowText title={row.name} detail={connecting ? "Connecting…" : rowDetail(session)} />
      </button>
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
