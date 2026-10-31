/** PR review controls around upstream's shared, keyboard-navigable file tree. */
import * as Schema from "effect/Schema";
import { type ReactNode } from "react";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { DiffFileTree, type DiffFileTreeEntry } from "../diffs/DiffFileTree";
import { DiffExplorerTreeHeader } from "./t3team-DiffExplorerTreeHeader";
import { PathList } from "./t3team-DiffExplorerTreeRows";
import { DiffExplorerReviewAccessory } from "./t3team-DiffExplorerReviewAccessory";
import type { PrTreeDockSide } from "./t3team-prCodeTreeDock.logic";
import { countViewedFiles, type DiffExplorerFile } from "./t3team-prDiffExplorer.logic";

import { prTreeReviewIndex } from "./t3team-prTreeReviewIndex";

const FULL_PATHS_STORAGE_KEY = "t3code.pullRequestFileTreeFullPaths";

export interface DiffExplorerFileTreeProps {
  readonly reviewControlsEnabled: boolean;
  readonly entries: readonly DiffFileTreeEntry[];
  readonly files: readonly DiffExplorerFile[];
  readonly selectedKey: string | null;
  readonly viewed: ReadonlySet<string>;
  readonly changed: ReadonlySet<string>;
  readonly onSelectFile: (key: string) => void;
  readonly onToggleViewed: (key: string) => void;
  readonly onMarkAllViewed: () => void;
  readonly onToggleDirectoryViewed: (path: string) => void;
  readonly ariaLabel: string;
  readonly side: PrTreeDockSide;
  readonly onSwapSide: () => void;
  readonly footer?: ReactNode;
}

export function DiffExplorerFileTree(props: DiffExplorerFileTreeProps) {
  const {
    entries,
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
  } = props;
  const [showFullPaths, setShowFullPaths] = useLocalStorage(
    FULL_PATHS_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const counts = countViewedFiles(files, viewed, changed);
  const { byPath, directories } = prTreeReviewIndex(files);
  const header = (accessoryOnly: boolean) => (
    <DiffExplorerTreeHeader
      accessoryOnly={accessoryOnly}
      fileCount={files.length}
      viewedCount={counts.viewed}
      showFullPaths={showFullPaths}
      onToggleFullPaths={() => setShowFullPaths(!showFullPaths)}
      onMarkAllViewed={onMarkAllViewed}
      side={side}
      onSwapSide={onSwapSide}
    />
  );
  return (
    <aside
      data-pr-tree-pane
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col border-border/60 bg-background",
        side === "left" ? "border-r" : "border-l",
      )}
    >
      {showFullPaths ? (
        <>
          {header(false)}
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
            aria-label={ariaLabel}
          >
            <PathList
              files={files}
              selectedKey={selectedKey}
              viewed={viewed}
              changed={changed}
              onSelectFile={onSelectFile}
              onToggleViewed={onToggleViewed}
            />
          </div>
          {footer}
        </>
      ) : null}
      <div className={showFullPaths ? "hidden" : "flex min-h-0 flex-1"}>
        <DiffFileTree
          entries={entries}
          ariaLabel={ariaLabel}
          selectedPath={files.find((file) => file.key === selectedKey)?.path ?? null}
          onSelectFile={(path) => {
            const file = byPath.get(path);
            if (file) onSelectFile(file.key);
          }}
          headerAccessory={header(true)}
          footer={footer}
          renderRowAccessory={(path, row) => (
            <DiffExplorerReviewAccessory
              path={path}
              directory={row.kind === "directory"}
              directoryCheckbox={props.reviewControlsEnabled}
              file={byPath.get(path)}
              descendants={directories.get(path) ?? []}
              viewed={viewed}
              changed={changed}
              onToggleViewed={onToggleViewed}
              onToggleDirectoryViewed={onToggleDirectoryViewed}
            />
          )}
        />
      </div>
    </aside>
  );
}
