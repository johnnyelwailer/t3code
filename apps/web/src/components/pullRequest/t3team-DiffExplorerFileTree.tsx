/**
 * The PR diff explorer's file tree: a real directory tree (nested, not a repeated path list)
 * where every file carries a "viewed" checkbox. Presentational — the parent owns selection,
 * the viewed set, and paging; this only draws the pane's chrome and delegates the rows to
 * `TreeLevel`.
 */
import { CheckCheckIcon, ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  buildDiffExplorerTree,
  compactDiffExplorerTree,
  countViewedFiles,
  diffExplorerDirectoryPaths,
  type DiffExplorerFile,
} from "./t3team-prDiffExplorer.logic";
import { TreeLevel } from "./t3team-DiffExplorerTreeRows";

export interface DiffExplorerFileTreeProps {
  readonly files: readonly DiffExplorerFile[];
  readonly selectedKey: string | null;
  readonly viewed: ReadonlySet<string>;
  readonly onSelectFile: (key: string) => void;
  readonly onToggleViewed: (key: string) => void;
  readonly onMarkAllViewed: () => void;
  readonly ariaLabel: string;
  /** Rendered under the tree, for a host that still has files to fetch. */
  readonly footer?: ReactNode;
}

/**
 * The file-tree pane of the PR diff view. Directories start open; the header reports how much
 * of the change is marked viewed and offers "mark all" plus expand/collapse-all.
 */
export function DiffExplorerFileTree({
  files,
  selectedKey,
  viewed,
  onSelectFile,
  onToggleViewed,
  onMarkAllViewed,
  ariaLabel,
  footer,
}: DiffExplorerFileTreeProps) {
  const tree = useMemo(() => compactDiffExplorerTree(buildDiffExplorerTree(files)), [files]);
  const directoryPaths = useMemo(() => diffExplorerDirectoryPaths(tree), [tree]);
  const counts = useMemo(() => countViewedFiles(files, viewed), [files, viewed]);

  // Track closed folders rather than open ones so a directory that arrives with a later slice
  // opens by default instead of defaulting to hidden.
  const [closedDirectories, setClosedDirectories] = useState<ReadonlySet<string>>(new Set());
  const openDirectories = useMemo(() => {
    const open = new Set(directoryPaths);
    for (const path of closedDirectories) open.delete(path);
    return open;
  }, [directoryPaths, closedDirectories]);

  const toggleDirectory = (path: string) =>
    setClosedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const everythingOpen = closedDirectories.size === 0;

  return (
    <aside className="flex min-h-0 min-w-0 shrink-0 flex-col border-l border-border/60 bg-background">
      <div
        className="flex h-10 min-h-10 shrink-0 items-center gap-1 border-b border-border/60 px-2 text-xs text-muted-foreground"
        data-surface-subheader
      >
        <span className="px-1 font-medium text-foreground">Files</span>
        <span className="tabular-nums">{files.length}</span>
        <span className="ml-auto tabular-nums text-[11px]">
          {counts.viewed}/{counts.total} viewed
        </span>
        {directoryPaths.length > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={everythingOpen ? "Collapse all folders" : "Expand all folders"}
                  onClick={() =>
                    setClosedDirectories(
                      everythingOpen ? new Set(directoryPaths) : new Set<string>(),
                    )
                  }
                />
              }
            >
              {everythingOpen ? (
                <ChevronsDownUpIcon className="size-3.5" />
              ) : (
                <ChevronsUpDownIcon className="size-3.5" />
              )}
            </TooltipTrigger>
            <TooltipPopup side="top">
              {everythingOpen ? "Collapse all folders" : "Expand all folders"}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Mark all files as viewed"
                onClick={onMarkAllViewed}
              />
            }
          >
            <CheckCheckIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="top">Mark all as viewed</TooltipPopup>
        </Tooltip>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
        aria-label={ariaLabel}
      >
        <TreeLevel
          nodes={tree}
          depth={0}
          selectedKey={selectedKey}
          viewed={viewed}
          openDirectories={openDirectories}
          onSelectFile={onSelectFile}
          onToggleViewed={onToggleViewed}
          onToggleDirectory={toggleDirectory}
        />
      </div>
      {footer}
    </aside>
  );
}
