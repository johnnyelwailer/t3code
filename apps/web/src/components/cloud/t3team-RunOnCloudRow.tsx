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
 * (connect waits for the first send). Failed: dismissible. Blocked ("Move to" a project the
 * machine cannot get): shown, not choosable, with the reason.
 */
export function RunOnCloudRow(props: {
  readonly row: Row;
  readonly selectable: boolean;
  /** This session is the optimistic Run-on selection (even while provisioning). */
  readonly selected: boolean;
  readonly onSelect: (session: CloudSession) => void;
  readonly onDismiss: ((session: CloudSession) => void) | undefined;
  /** Why this machine cannot be chosen here; null when it can. */
  readonly blockedReason?: string | null | undefined;
  /** t3team: stop the machine (reversible); the row shows it while in flight. */
  readonly onStop?: ((session: CloudSession) => void) | undefined;
  /** t3team: delete the machine's persistent state; the confirm happens in the handler. */
  readonly onDelete?: ((session: CloudSession) => void) | undefined;
  readonly stopPending?: boolean;
  readonly deletePending?: boolean;
}) {
  const { row, selected } = props;
  const { session } = row;
  const working = presentCloudSession(session).tone === "working";
  if (props.blockedReason && (row.environment !== null || session.phase === "ready" || working)) {
    return (
      <div
        aria-disabled="true"
        className={cn(ROW_CLASS, "cursor-not-allowed text-muted-foreground")}
      >
        <EnvironmentMachineIcon kind="cloud" className="mt-1 size-3 shrink-0" />
        <RowText title={row.name} detail={props.blockedReason} wrapDetail />
      </div>
    );
  }
  if (row.environment !== null && props.selectable) {
    // The machine this thread runs on: pickable like any machine, with its verbs beside it.
    const hasActions = props.onStop !== undefined || props.onDelete !== undefined;
    if (!hasActions) {
      return (
        <SelectItem value={row.environment.environmentId}>
          <span className="flex min-w-0 items-start gap-1.5">
            <EnvironmentMachineIcon kind="cloud" className="mt-1 size-3 shrink-0" />
            <RowText title={row.name} detail={rowDetail(session)} />
          </span>
        </SelectItem>
      );
    }
    return (
      <div className={cn(ROW_CLASS, "bg-muted/60")}>
        <button
          type="button"
          onClick={() => props.onSelect(session)}
          className="-mx-2 flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 rounded-sm px-2 py-1.5 hover:bg-muted/40"
        >
          <EnvironmentMachineIcon kind="cloud" className="mt-1 size-3 shrink-0" />
          <RowText title={row.name} detail={`Selected · ${rowDetail(session)}`} />
        </button>
        <RowMachineActions
          session={session}
          onStop={props.onStop}
          onDelete={props.onDelete}
          stopPending={props.stopPending === true}
          deletePending={props.deletePending === true}
        />
      </div>
    );
  }
  // Ready or still coming up: selectable preference (connect waits for first send).
  // Connected-without-project used to grey out as "Doesn't have this project"; that
  // gate is deferred to bind-on-send so one click still selects the machine.
  if (session.phase === "ready" || working) {
    const detail = selected
      ? `Selected · ${rowDetail(session)}`
      : row.unavailable
        ? `${rowDetail(session)} · project syncs on send`
        : rowDetail(session);
    const hasActions = props.onStop !== undefined || props.onDelete !== undefined;
    return (
      <div className={cn(ROW_CLASS, selected && "bg-muted/60")}>
        <button
          type="button"
          onClick={() => props.onSelect(session)}
          className={cn(
            "-mx-2 flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 rounded-sm px-2 py-1.5 hover:bg-muted/40",
          )}
        >
          <EnvironmentMachineIcon
            kind="cloud"
            className={cn("mt-1 size-3 shrink-0", working && "animate-pulse")}
          />
          <RowText title={row.name} detail={detail} />
        </button>
        {hasActions ? (
          <RowMachineActions
            session={session}
            onStop={props.onStop}
            onDelete={props.onDelete}
            stopPending={props.stopPending === true}
            deletePending={props.deletePending === true}
          />
        ) : null}
      </div>
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
      {/* An ended machine still owns its workspace: it can be deleted, just not stopped. */}
      {session.phase === "failed" ||
      session.phase === "stopped" ||
      session.phase === "cancelled" ? (
        props.onDelete !== undefined ? (
          <RowMachineActions
            session={session}
            onStop={undefined}
            onDelete={props.onDelete}
            stopPending={false}
            deletePending={props.deletePending === true}
          />
        ) : null
      ) : null}
    </div>
  );
}

/**
 * The machine verbs beside a Run-on row: clearly labelled Stop and Delete. Stop is
 * reversible (the workspace is kept); Delete asks once in its handler. Both stop the row's
 * select click, so a delete can never ride along as an optimistic target.
 */
function RowMachineActions({
  session,
  onStop,
  onDelete,
  stopPending,
  deletePending,
}: {
  readonly session: CloudSession;
  readonly onStop?: ((session: CloudSession) => void) | undefined;
  readonly onDelete?: ((session: CloudSession) => void) | undefined;
  readonly stopPending: boolean;
  readonly deletePending: boolean;
}) {
  const className =
    "shrink-0 cursor-pointer rounded-sm border bg-background px-1.5 py-0.5 text-xs hover:bg-muted";
  return (
    <span className="ml-1 flex shrink-0 items-center gap-1">
      {onStop !== undefined ? (
        <button
          type="button"
          className={className}
          disabled={stopPending || deletePending}
          onClick={(event) => {
            event.stopPropagation();
            onStop(session);
          }}
        >
          {stopPending ? "Stopping…" : "Stop"}
        </button>
      ) : null}
      {onDelete !== undefined ? (
        <button
          type="button"
          className={cn(className, "text-destructive hover:text-destructive")}
          disabled={stopPending || deletePending}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(session);
          }}
        >
          {deletePending ? "Deleting…" : "Delete"}
        </button>
      ) : null}
    </span>
  );
}

/**
 * The name over what it is doing, so a narrow menu truncates the detail, never the name. A reason
 * the user has to act on wraps instead: cut short, it would not say what to do.
 */
function RowText({
  title,
  detail,
  wrapDetail = false,
}: {
  readonly title: string;
  readonly detail: string;
  readonly wrapDetail?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-start text-left">
      <span className="max-w-full truncate">{title}</span>
      <span className={cn("max-w-full text-muted-foreground text-xs", !wrapDetail && "truncate")}>
        {detail}
      </span>
    </span>
  );
}
