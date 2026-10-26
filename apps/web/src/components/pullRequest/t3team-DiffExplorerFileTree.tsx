/**
 * The PR diff explorer's file tree: a real directory tree (nested, not a repeated path list)
 * where every file carries a "viewed" checkbox, or the same files as a flat list of full paths.
 * Presentational — the parent owns selection, the viewed set, paging and where the pane sits;
 * this only draws the pane's chrome and delegates the rows.
 */
import * as Schema from "effect/Schema";
import { useMemo, useState, type ReactNode } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";

import { DiffExplorerTreeHeader } from "./t3team-DiffExplorerTreeHeader";
import { PathList, TreeLevel } from "./t3team-DiffExplorerTreeRows";
import type { PrTreeDockSide } from "./t3team-prCodeTreeDock.logic";
import {
  buildDiffExplorerTree,
  compactDiffExplorerTree,
  countViewedFiles,
  diffExplorerDirectoryPaths,
  type DiffExplorerFile,
} from "./t3team-prDiffExplorer.logic";

const FULL_PATHS_STORAGE_KEY = "t3code.pullRequestFileTreeFullPaths";

export interface DiffExplorerFileTreeProps {
  readonly files: readonly DiffExplorerFile[];
  readonly selectedKey: string | null;
  readonly viewed: ReadonlySet<string>;
  /** Ticked files that changed since they were viewed: flagged in the tree, not counted as viewed. */
  readonly changed: ReadonlySet<string>;
  readonly onSelectFile: (key: string) => void;
  readonly onToggleViewed: (key: string) => void;
  readonly onMarkAllViewed: () => void;
  /** Marks every file under the directory viewed, or clears them when all already are. */
  readonly onToggleDirectoryViewed: (directoryPath: string) => void;
  readonly ariaLabel: string;
  /** The side the pane is docked on, which decides which edge carries its divider. */
  readonly side: PrTreeDockSide;
  readonly onSwapSide: () => void;
  /** Rendered under the tree, for a host that still has files to fetch. */
  readonly footer?: ReactNode;
}

/**
 * The file-tree pane of the PR diff view. Directories start open; the header reports how much
 * of the change is marked viewed and offers "mark all", expand/collapse-all, a full-path list
 * and the dock side.
 */
export function DiffExplorerFileTree({
  files,
  selectedKey,
  viewed,
  changed,
  onSelectFile,
  onToggleViewed,
  onMarkAllViewed,
  onToggleDirectoryViewed,
  ariaLabel,
  side,
  onSwapSide,
  footer,
}: DiffExplorerFileTreeProps) {
  const tree = useMemo(() => compactDiffExplorerTree(buildDiffExplorerTree(files)), [files]);
  const directoryPaths = useMemo(() => diffExplorerDirectoryPaths(tree), [tree]);
  const counts = useMemo(() => countViewedFiles(files, viewed, changed), [files, viewed, changed]);
  const [showFullPaths, setShowFullPaths] = useLocalStorage(
    FULL_PATHS_STORAGE_KEY,
    false,
    Schema.Boolean,
  );

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
    // Fills the pane its parent sized rather than sizing itself to the longest path: as a
    // shrink-0 flex child it took max-content width, so a deep compacted folder pushed the
    // diffstats, counts and header buttons past the pane's right edge, where they were clipped.
    <aside
      data-pr-tree-pane
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col border-border/60 bg-background",
        side === "left" ? "border-r" : "border-l",
      )}
    >
      <DiffExplorerTreeHeader
        fileCount={files.length}
        viewedCount={counts.viewed}
        hasDirectories={directoryPaths.length > 0}
        everythingOpen={everythingOpen}
        onToggleAllDirectories={() =>
          setClosedDirectories(everythingOpen ? new Set(directoryPaths) : new Set<string>())
        }
        showFullPaths={showFullPaths}
        onToggleFullPaths={() => setShowFullPaths(!showFullPaths)}
        onMarkAllViewed={onMarkAllViewed}
        side={side}
        onSwapSide={onSwapSide}
      />
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
        aria-label={ariaLabel}
      >
        {showFullPaths ? (
          <PathList
            files={files}
            selectedKey={selectedKey}
            viewed={viewed}
            changed={changed}
            onSelectFile={onSelectFile}
            onToggleViewed={onToggleViewed}
          />
        ) : (
          <TreeLevel
            nodes={tree}
            depth={0}
            selectedKey={selectedKey}
            viewed={viewed}
            changed={changed}
            openDirectories={openDirectories}
            onSelectFile={onSelectFile}
            onToggleViewed={onToggleViewed}
            onToggleDirectory={toggleDirectory}
            onToggleDirectoryViewed={onToggleDirectoryViewed}
          />
        )}
      </div>
      {footer}
    </aside>
  );
}
