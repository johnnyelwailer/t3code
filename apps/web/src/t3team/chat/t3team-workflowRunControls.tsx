/**
 * Pause / resume / stop for a live workflow run.
 *
 * Split out of `t3team-messageShapeCardLive` to keep that file under the 200-line cap. It is also a
 * coherent unit on its own: the three controls, which of them apply to the current status, and the
 * in-flight/error copy that goes with pressing one.
 */

import { EllipsisIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react";

import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/t3team/components/ui/t3team-menu";

export type WorkflowRunControlAction = "pause" | "resume" | "stop";

const ICON_BUTTON_CLASS_NAME =
  "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

/** The transient line above the card while a control is in flight, or after one failed. */
export function T3TeamWorkflowRunControlStatus({
  pending,
  error,
}: {
  readonly pending: WorkflowRunControlAction | null;
  readonly error: string | null;
}) {
  return (
    <>
      {pending !== null ? (
        <div className="mb-2 text-xs font-medium text-muted-foreground" role="status">
          {pending === "pause" ? "Pausing…" : pending === "resume" ? "Resuming…" : "Stopping…"}
        </div>
      ) : null}
      {error ? (
        <div className="mb-2 text-xs font-medium text-destructive" role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}

export function T3TeamWorkflowRunControls({
  canPause,
  canResume,
  canStop,
  pending,
  className,
  onControl,
}: {
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canStop: boolean;
  readonly pending: WorkflowRunControlAction | null;
  readonly className: string;
  readonly onControl: (action: WorkflowRunControlAction) => void;
}) {
  if (!canPause && !canResume && !canStop) {
    return null;
  }

  return (
    <div className={className}>
      {canPause ? (
        <button
          type="button"
          disabled={pending !== null}
          title="Pause at this safe waiting point"
          aria-label="Pause orchestration"
          className={ICON_BUTTON_CLASS_NAME}
          onClick={() => onControl("pause")}
        >
          <PauseIcon className="size-3.5" />
        </button>
      ) : null}
      {canResume ? (
        <button
          type="button"
          disabled={pending !== null}
          title="Resume orchestration"
          aria-label="Resume orchestration"
          className={ICON_BUTTON_CLASS_NAME}
          onClick={() => onControl("resume")}
        >
          <PlayIcon className="size-3.5" />
        </button>
      ) : null}
      {canStop ? (
        <Menu>
          <MenuTrigger
            aria-label="More orchestration actions"
            disabled={pending !== null}
            className={ICON_BUTTON_CLASS_NAME}
          >
            <EllipsisIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="bottom" className="min-w-40">
            <MenuItem variant="destructive" onClick={() => onControl("stop")}>
              <SquareIcon className="size-3.5" />
              Stop workflow
            </MenuItem>
          </MenuPopup>
        </Menu>
      ) : null}
    </div>
  );
}
