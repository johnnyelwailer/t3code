import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { WrenchIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { cloudSessionEnvironment } from "../../state/t3team-cloudSessions";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { presentProjectMachine } from "./t3team-cloudSessionMachinePresentation";

/**
 * Says which machine "New cloud session" will start for this project: its devcontainer, or a
 * definition that needs fixing first. Rendered only inside the open Run-on menu, so the
 * discovery (a read of the project's checkouts) runs when someone is about to choose.
 */
export function CloudSessionMachineHint({
  environmentId,
  projectId,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}) {
  const result = useAtomValue(
    cloudSessionEnvironment.projectMachine({ environmentId, input: { projectId } }),
  );
  const discovery = AsyncResult.value(result);
  const hint = Option.isNone(discovery) ? null : presentProjectMachine(discovery.value);
  if (hint === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        className={hint.tone === "warning" ? "text-warning-foreground" : "text-muted-foreground"}
      >
        {hint.label}
      </TooltipTrigger>
      <TooltipPopup>{hint.detail}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * "Set up a machine", only when discovery found nothing to build. A rejected file is a fix, not a
 * setup, so this stays hidden and the hint on New cloud session says what to fix.
 */
export function ProjectMachineSetupButton({
  environmentId,
  projectId,
  pending,
  disabled = false,
  onSetup,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly pending: boolean;
  /** Another create is already in flight, so this row stays quiet and refuses a second click. */
  readonly disabled?: boolean;
  readonly onSetup: () => void;
}) {
  const result = useAtomValue(
    cloudSessionEnvironment.projectMachine({ environmentId, input: { projectId } }),
  );
  const discovery = AsyncResult.value(result);
  const offer =
    Option.isSome(discovery) &&
    discovery.value.status._tag === "None" &&
    discovery.value.rejected.length === 0;
  if (!offer) return null;
  return (
    <button
      type="button"
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={onSetup}
      className={cn(
        "flex w-full items-start gap-1.5 rounded-sm px-2 py-1.5 text-left text-foreground sm:text-sm",
        pending || disabled
          ? "cursor-default text-muted-foreground"
          : "cursor-pointer hover:bg-muted",
      )}
    >
      <WrenchIcon
        className={cn("mt-0.5 size-3 shrink-0 self-start", pending && "animate-pulse")}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-col items-start">
        <span>{pending ? "Requesting a machine…" : "Set up a machine"}</span>
        <span className="max-w-full truncate text-muted-foreground text-xs">
          This project has none yet. An agent writes it and opens a change request.
        </span>
      </span>
    </button>
  );
}
