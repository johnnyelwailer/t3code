/**
 * One directory row of the PR diff file tree: a viewed checkbox for every file underneath, then
 * the expand/collapse chevron, folder icon, name and file count. The checkbox state is derived
 * from the files each render, so a file that pages in later drops the folder back to partial.
 */
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon } from "lucide-react";

import { Checkbox } from "../ui/checkbox";
import {
  diffExplorerDirectoryDisplayPath,
  diffExplorerFileKeys,
  diffExplorerViewedState,
} from "./t3team-prDiffExplorer.directoryViewed";
import type { DiffExplorerNode } from "./t3team-prDiffExplorer.logic";

type DirectoryNode = Extract<DiffExplorerNode, { readonly kind: "directory" }>;

export function DiffExplorerDirectoryRow({
  node,
  open,
  viewed,
  onToggleOpen,
  onToggleViewed,
}: {
  readonly node: DirectoryNode;
  readonly open: boolean;
  readonly viewed: ReadonlySet<string>;
  readonly onToggleOpen: () => void;
  readonly onToggleViewed: () => void;
}) {
  const keys = diffExplorerFileKeys(node.children);
  const state = diffExplorerViewedState(keys, viewed);
  const path = diffExplorerDirectoryDisplayPath(node);
  return (
    <div
      role="treeitem"
      aria-expanded={open}
      tabIndex={0}
      onClick={onToggleOpen}
      onKeyDown={(event) => {
        // The checkbox answers Space itself; only the row answers its own presses.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggleOpen();
        }
      }}
      className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded px-1.5 text-left text-xs text-foreground/90 outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {/* Base UI answers a click on the box by clicking a hidden sibling input, and that second
          click bubbles to the row; stopping it on the root alone leaves the folder toggling. */}
      <span className="flex shrink-0" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          aria-label={`Mark all files in ${path} as ${state === "all" ? "not viewed" : "viewed"}`}
          checked={state === "all"}
          indeterminate={state === "partial"}
          onCheckedChange={onToggleViewed}
          className="size-3.5 sm:size-3.5"
        />
      </span>
      <span className="shrink-0 text-muted-foreground">
        {open ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronRightIcon className="size-3.5" />
        )}
      </span>
      <span className="shrink-0 text-muted-foreground">
        {open ? <FolderOpenIcon className="size-3.5" /> : <FolderIcon className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <span className="shrink-0 text-3xs tabular-nums text-muted-foreground/70">{keys.length}</span>
    </div>
  );
}
