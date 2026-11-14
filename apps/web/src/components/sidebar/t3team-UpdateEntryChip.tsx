import { useAtomValue } from "@effect/atom-react";
import { CircleArrowUpIcon, DownloadIcon, RotateCwIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { updateEntryActionTitle } from "./t3team-nexiUpdateNotice.logic";
import { runningThreadCountAtom } from "./UpdateEverythingDialog";

const ICONS = { download: DownloadIcon, restart: RotateCwIcon, update: CircleArrowUpIcon } as const;

export interface UpdateEntryAction {
  readonly label: string;
  readonly icon: keyof typeof ICONS;
  /** The machine this action restarts; its running threads are named in the action's label. */
  readonly restartEnvironmentId: string | null;
  readonly pending: boolean;
  readonly onClick: () => void;
}

/** One update-dialog table entry: its name and, when it can be updated on its own, that action. */
export function UpdateEntryChip({
  label,
  action,
}: {
  readonly label: string;
  readonly action: UpdateEntryAction | null;
}) {
  const threads = useAtomValue(runningThreadCountAtom(action?.restartEnvironmentId ?? ""));
  const Icon = action ? ICONS[action.icon] : null;
  const title = action ? updateEntryActionTitle(action.label, threads) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border border-border/70 bg-muted/40 py-0.5 ps-2",
        action ? "pe-0.5" : "pe-2",
      )}
    >
      {label}
      {action && Icon && title ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={title}
                disabled={action.pending}
                onClick={action.onClick}
              >
                {action.pending ? <Spinner size="xs" /> : <Icon />}
              </Button>
            }
          />
          <TooltipPopup side="top">{title}</TooltipPopup>
        </Tooltip>
      ) : null}
    </span>
  );
}
