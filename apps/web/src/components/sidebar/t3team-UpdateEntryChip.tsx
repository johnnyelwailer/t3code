import { useAtomValue } from "@effect/atom-react";
import { CircleArrowUpIcon, DownloadIcon, RotateCwIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { updateEntryActionTitle } from "./t3team-nexiUpdateNotice.logic";
import { runningThreadCountAtom } from "./UpdateEverythingDialog";

const ICONS = { download: DownloadIcon, restart: RotateCwIcon, update: CircleArrowUpIcon } as const;

export interface UpdateEntryAction {
  readonly label: string;
  readonly icon: keyof typeof ICONS;
  /** Every machine this action restarts; all their running threads are named in its label. */
  readonly restartEnvironmentIds: ReadonlyArray<string>;
  readonly pending: boolean;
  readonly onClick: () => void;
}

/** One update-dialog table entry: a plain name, or a bordered chip when it updates on its own. */
export function UpdateEntryChip({
  label,
  action,
}: {
  readonly label: string;
  readonly action: UpdateEntryAction | null;
}) {
  const threads = useAtomValue(
    runningThreadCountAtom((action?.restartEnvironmentIds ?? []).join("\n")),
  );
  if (action === null) return <span className="whitespace-nowrap">{label}</span>;
  const Icon = ICONS[action.icon];
  const title = updateEntryActionTitle(action.label, threads);
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border border-border/70 bg-muted/40 py-0.5 ps-2 pe-0.5">
      {label}
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
              {action.pending ? <Spinner size="xs" /> : <Icon className="text-foreground" />}
            </Button>
          }
        />
        <TooltipPopup side="top">{title}</TooltipPopup>
      </Tooltip>
    </span>
  );
}
