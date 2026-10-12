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
 * One cloud machine in the "Run on" list. Connected: a choice like any machine.
 * Ready or still provisioning: one click selects it as the optimistic target
 * (connect waits for the first send). Failed: dismissible.
 */
export function RunOnCloudRow(props: {
  readonly row: Row;
  readonly selectable: boolean;
  /** This session is the optimistic Run-on selection (even while provisioning). */
  readonly selected: boolean;
  readonly onSelect: (session: CloudSession) => void;
  readonly onDismiss: ((session: CloudSession) => void) | undefined;
}) {
  const { row, selected } = props;
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
  // Ready or still coming up: selectable preference (connect waits for first send).
  // Connected-without-project used to grey out as "Doesn't have this project"; that
  // gate is deferred to bind-on-send so one click still selects the machine.
  if (session.phase === "ready" || presentCloudSession(session).tone === "working") {
    const detail = selected
      ? `Selected · ${rowDetail(session)}`
      : row.unavailable
        ? `${rowDetail(session)} · project syncs on send`
        : rowDetail(session);
    return (
      <button
        type="button"
        onClick={() => props.onSelect(session)}
        className={cn(
          ROW_CLASS,
          "cursor-pointer text-foreground hover:bg-muted",
          selected && "bg-muted/60",
        )}
      >
        <EnvironmentMachineIcon
          kind="cloud"
          className={cn(
            "mt-1 size-3 shrink-0",
            presentCloudSession(session).tone === "working" && "animate-pulse",
          )}
        />
        <RowText title={row.name} detail={detail} />
      </button>
    );
  }
  return (
    <div className={cn(ROW_CLASS, "text-muted-foreground")}>
      <EnvironmentMachineIcon kind="cloud" className="mt-1 size-3 shrink-0" />
      <RowText title={row.name} detail={rowDetail(session)} />
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
