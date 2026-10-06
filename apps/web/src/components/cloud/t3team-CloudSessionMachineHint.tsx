import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

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
