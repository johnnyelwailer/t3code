/* oxlint-disable t3code/no-outset-state-indicators -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * One file in the PR diff explorer: its viewed checkbox, its name and its add/remove counts.
 * Shared by the nested tree, where the folders above already say where the file lives and the
 * name alone is shown, and the path list, where the whole path is spelled out and wraps rather
 * than being cut off.
 */
import { cn } from "~/lib/utils";

import { Checkbox } from "../ui/checkbox";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { DiffExplorerFile } from "./t3team-prDiffExplorer.logic";

function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-2xs tabular-nums">
      <span className="text-diff-addition-foreground">+{additions}</span>
      <span className="text-diff-deletion-foreground">-{deletions}</span>
    </span>
  );
}

export interface DiffExplorerFileRowProps {
  readonly file: DiffExplorerFile;
  readonly selected: boolean;
  readonly viewed: boolean;
  readonly showFullPath: boolean;
  readonly onSelect: (key: string) => void;
  readonly onToggleViewed: (key: string) => void;
}

/** The folders of a path, with a line-break opportunity after each slash. */
function breakableDirectory(directory: string) {
  const segments = directory.split("/").slice(0, -1);
  return segments.map((segment, depth) => (
    <span key={segments.slice(0, depth + 1).join("/")}>
      {segment}/<wbr />
    </span>
  ));
}

function FullPath({ path, viewed }: { path: string; viewed: boolean }) {
  const slash = path.lastIndexOf("/");
  return (
    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
      <span className="text-muted-foreground">{breakableDirectory(path.slice(0, slash + 1))}</span>
      <span className={viewed ? "text-muted-foreground" : "text-foreground"}>
        {path.slice(slash + 1)}
      </span>
    </span>
  );
}

function FileName({ path, viewed }: { path: string; viewed: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              viewed ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {path.split("/").at(-1) ?? path}
          </span>
        }
      />
      <TooltipPopup side="top">{path}</TooltipPopup>
    </Tooltip>
  );
}

export function DiffExplorerFileRow({
  file,
  selected,
  viewed,
  showFullPath,
  onSelect,
  onToggleViewed,
}: DiffExplorerFileRowProps) {
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      tabIndex={0}
      onClick={() => onSelect(file.key)}
      onKeyDown={(event) => {
        // The checkbox answers Space itself; only the row answers its own presses.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(file.key);
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 text-xs outline-none",
        "hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring",
        showFullPath ? "min-h-7 py-1" : "h-7",
        selected && "bg-foreground/[0.08]",
      )}
    >
      <Checkbox
        aria-label={`Mark ${file.path} as ${viewed ? "not viewed" : "viewed"}`}
        checked={viewed}
        onCheckedChange={() => onToggleViewed(file.key)}
        onClick={(event) => event.stopPropagation()}
        className="size-3.5 sm:size-3.5"
      />
      {showFullPath ? (
        <FullPath path={file.path} viewed={viewed} />
      ) : (
        <FileName path={file.path} viewed={viewed} />
      )}
      <DiffStat additions={file.additions} deletions={file.deletions} />
    </div>
  );
}
