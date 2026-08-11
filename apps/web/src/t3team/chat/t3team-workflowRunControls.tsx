/**
 * Pause / resume / stop for a live workflow run.
 *
 * Split out of `t3team-messageShapeCardLive` to keep that file under the 200-line cap. It is also a
 * coherent unit on its own: the three controls, which of them apply to the current status, and the
 * in-flight/error copy that goes with pressing one.
 */

import { EllipsisIcon, PauseIcon, PlayIcon, ShieldIcon, SquareIcon } from "lucide-react";
import type { ProjectRecipeWorkflowCapability } from "@t3tools/project-recipes";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/t3team/components/ui/t3team-menu";
import { describeT3TeamShapeCapability } from "~/t3team/chat/t3team-messageShapeCardCapabilities";

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

/**
 * Pause / resume buttons plus the "…" menu. The menu doubles as the home for the run's declared
 * `capabilities` disclosure (Epic 25 §Capability gating) — trust metadata, not working info, so it
 * moved out of the card body and into here. The menu still renders for a capability-only run with
 * no `onControl` handler at all (a read-only card can still disclose what the run may do).
 */
export function T3TeamWorkflowRunControls({
  canPause,
  canResume,
  canStop,
  pending,
  className,
  onControl,
  capabilities,
}: {
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canStop: boolean;
  readonly pending: WorkflowRunControlAction | null;
  readonly className: string;
  readonly onControl?: (action: WorkflowRunControlAction) => void;
  readonly capabilities?: ReadonlyArray<ProjectRecipeWorkflowCapability>;
}) {
  const hasCapabilities = capabilities !== undefined && capabilities.length > 0;
  const showPause = onControl !== undefined && canPause;
  const showResume = onControl !== undefined && canResume;
  const showStopItem = onControl !== undefined && canStop;
  const showMenu = hasCapabilities || showStopItem;

  if (!showPause && !showResume && !showMenu) {
    return null;
  }

  return (
    <div className={className}>
      {showPause ? (
        <button
          type="button"
          disabled={pending !== null}
          title="Pause at this safe waiting point"
          aria-label="Pause orchestration"
          className={ICON_BUTTON_CLASS_NAME}
          onClick={() => onControl?.("pause")}
        >
          <PauseIcon className="size-3.5" />
        </button>
      ) : null}
      {showResume ? (
        <button
          type="button"
          disabled={pending !== null}
          title="Resume orchestration"
          aria-label="Resume orchestration"
          className={ICON_BUTTON_CLASS_NAME}
          onClick={() => onControl?.("resume")}
        >
          <PlayIcon className="size-3.5" />
        </button>
      ) : null}
      {showMenu ? (
        <Menu>
          <MenuTrigger
            aria-label={showStopItem ? "More orchestration actions" : "What this run may do"}
            disabled={pending !== null && showStopItem}
            className={ICON_BUTTON_CLASS_NAME}
          >
            <EllipsisIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="bottom" className="min-w-48">
            {showStopItem ? (
              <MenuItem variant="destructive" onClick={() => onControl?.("stop")}>
                <SquareIcon className="size-3.5" />
                Stop workflow
              </MenuItem>
            ) : null}
            {hasCapabilities ? (
              <MenuGroup>
                {showStopItem ? <MenuSeparator /> : null}
                <MenuGroupLabel className="flex cursor-default items-center gap-1 px-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                  <ShieldIcon className="size-2.5" />
                  This run may
                </MenuGroupLabel>
                {capabilities.map((capability) => {
                  const { label, description } = describeT3TeamShapeCapability(capability);
                  return (
                    <div
                      key={`${capability.kind}:${capability.id}`}
                      className="cursor-default px-2 py-0.5 text-xs text-muted-foreground"
                      title={description}
                    >
                      {label}
                    </div>
                  );
                })}
              </MenuGroup>
            ) : null}
          </MenuPopup>
        </Menu>
      ) : null}
    </div>
  );
}
