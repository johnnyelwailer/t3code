import type { CloudSession } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { SelectItem } from "../ui/select";
import { presentCloudSession } from "./t3team-cloudSessionProvisionPresentation";
import { isTerminalCloudSessionPhase } from "./t3team-cloudSessionSplit";
import { runOnCloudRowDetail } from "./t3team-runOnSelection";
import type { RunOnCloudRow as Row } from "./t3team-runOnCloudRows";

const ROW_CLASS = "flex w-full items-start gap-1.5 rounded-sm px-2 py-1.5 sm:text-sm";

/**
 * One cloud machine in the "Run on" list. Ready, provisioning or shut down, one click selects it
 * (connect waits for the first send, and a shut-down machine resumes on send). Blocked ("Move to"
 * a project the machine cannot get): shown, not choosable, with the reason.
 */
export function RunOnCloudRow(props: {
  readonly row: Row;
  readonly selectable: boolean;
  /** This session is the optimistic Run-on selection (even while provisioning). */
  readonly selected: boolean;
  readonly onSelect: (session: CloudSession) => void;
  /** Why this machine cannot be chosen here; null when it can. */
  readonly blockedReason?: string | null | undefined;
  /** t3team: stop the machine (reversible); the row shows it while in flight. */
  readonly onStop?: ((session: CloudSession) => void) | undefined;
  /** t3team: delete the machine's persistent state; the confirm happens in the handler. */
  readonly onDelete?: ((session: CloudSession) => void) | undefined;
  /** t3team: start another session in a shut-down machine's place. */
  readonly onRetry?: (() => void) | undefined;
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
  const terminal = isTerminalCloudSessionPhase(session.phase);
  // An ended machine still owns its workspace: it can be deleted and started again, not stopped.
  const onStop = terminal ? undefined : props.onStop;
  const onRetry = terminal ? props.onRetry : undefined;
  const hasActions = onStop !== undefined || props.onDelete !== undefined || onRetry !== undefined;
  const detail = selected
    ? `Selected · ${runOnCloudRowDetail(session)}`
    : row.unavailable
      ? `${runOnCloudRowDetail(session)} · project syncs on send`
      : runOnCloudRowDetail(session);
  if (row.environment !== null && props.selectable && !hasActions) {
    // The machine this thread runs on, with nothing to act on beside it: a keyboard-reachable
    // choice like any machine.
    return (
      <SelectItem value={row.environment.environmentId}>
        <span className="flex min-w-0 items-start gap-1.5">
          <EnvironmentMachineIcon kind="cloud" className="mt-1 size-3 shrink-0" />
          <RowText title={row.name} detail={detail} />
        </span>
      </SelectItem>
    );
  }
  // Ready, still coming up, or shut down: all one click away from being the selection. A shut-down
  // machine resumes on send, the same as any ended session.
  // Connected-without-project used to grey out as "Doesn't have this project"; that
  // gate is deferred to bind-on-send so one click still selects the machine.
  return (
    <div
      className={cn(
        ROW_CLASS,
        selected && "bg-muted/60",
        terminal && !selected && "text-muted-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => props.onSelect(session)}
        className="-mx-2 flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 rounded-sm px-2 py-1.5 hover:bg-muted/40"
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
          onStop={onStop}
          onDelete={props.onDelete}
          onRetry={onRetry}
          stopPending={props.stopPending === true}
          deletePending={props.deletePending === true}
        />
      ) : null}
    </div>
  );
}

/**
 * The machine verbs beside a Run-on row: clearly labelled Retry, Stop and Delete. Stop is
 * reversible (the workspace is kept); Delete asks once in its handler. All of them stop the row's
 * select click, so a delete can never ride along as an optimistic target.
 */
function RowMachineActions({
  session,
  onStop,
  onDelete,
  onRetry,
  stopPending,
  deletePending,
}: {
  readonly session: CloudSession;
  readonly onStop?: ((session: CloudSession) => void) | undefined;
  readonly onDelete?: ((session: CloudSession) => void) | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly stopPending: boolean;
  readonly deletePending: boolean;
}) {
  const className =
    "shrink-0 cursor-pointer rounded-sm border bg-background px-1.5 py-0.5 text-xs hover:bg-muted";
  return (
    <span className="ml-1 flex shrink-0 items-center gap-1">
      {onRetry !== undefined ? (
        <button
          type="button"
          className={className}
          disabled={deletePending}
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
        >
          Retry
        </button>
      ) : null}
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
