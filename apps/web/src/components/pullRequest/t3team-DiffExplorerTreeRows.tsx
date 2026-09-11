/**
 * The row-level rendering of the PR diff file tree: one directory level (`TreeLevel`, recursive)
 * and the per-file add/remove badge (`DiffStat`). Kept apart from the pane's chrome so the tree
 * stays a small, focused unit.
 */
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon } from "lucide-react";

import { cn } from "~/lib/utils";

import { Checkbox } from "../ui/checkbox";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { diffExplorerFileCount, type DiffExplorerNode } from "./t3team-prDiffExplorer.logic";

function DiffStat({
  additions,
  deletions,
  className,
}: {
  additions: number;
  deletions: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums",
        className,
      )}
    >
      <span className="text-emerald-600 dark:text-emerald-500">+{additions}</span>
      <span className="text-rose-600 dark:text-rose-500">-{deletions}</span>
    </span>
  );
}

export interface DiffExplorerTreeLevelProps {
  readonly nodes: readonly DiffExplorerNode[];
  readonly depth: number;
  readonly selectedKey: string | null;
  readonly viewed: ReadonlySet<string>;
  readonly openDirectories: ReadonlySet<string>;
  readonly onSelectFile: (key: string) => void;
  readonly onToggleViewed: (key: string) => void;
  readonly onToggleDirectory: (path: string) => void;
}

/**
 * One directory level of the tree. Nesting plus the left border gives each level its own indent,
 * so the hierarchy reads as a tree instead of a repeated path list.
 */
export function TreeLevel({
  nodes,
  depth,
  selectedKey,
  viewed,
  openDirectories,
  onSelectFile,
  onToggleViewed,
  onToggleDirectory,
}: DiffExplorerTreeLevelProps) {
  return (
    <ul
      role={depth === 0 ? "tree" : "group"}
      aria-label={depth === 0 ? "Pull request files" : undefined}
      className={cn(depth > 0 && "ml-[15px] border-l border-border/40 pl-2")}
    >
      {nodes.map((node) => {
        if (node.kind === "directory") {
          const open = openDirectories.has(node.path);
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => onToggleDirectory(node.path)}
                aria-expanded={open}
                className="flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-xs text-foreground/90 hover:bg-foreground/[0.06]"
              >
                <span className="shrink-0 text-muted-foreground">
                  {open ? (
                    <ChevronDownIcon className="size-3.5" />
                  ) : (
                    <ChevronRightIcon className="size-3.5" />
                  )}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {open ? (
                    <FolderOpenIcon className="size-3.5" />
                  ) : (
                    <FolderIcon className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                  {diffExplorerFileCount(node.children)}
                </span>
              </button>
              {open ? (
                <TreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  selectedKey={selectedKey}
                  viewed={viewed}
                  openDirectories={openDirectories}
                  onSelectFile={onSelectFile}
                  onToggleViewed={onToggleViewed}
                  onToggleDirectory={onToggleDirectory}
                />
              ) : null}
            </li>
          );
        }
        const file = node.file;
        const selected = file.key === selectedKey;
        const isViewed = viewed.has(file.key);
        const name = file.path.split("/").at(-1) ?? file.path;
        return (
          <li key={file.key}>
            <div
              role="treeitem"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => onSelectFile(file.key)}
              onKeyDown={(event) => {
                // The checkbox answers Space itself; only the row answers its own presses.
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectFile(file.key);
                }
              }}
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-1.5 rounded px-1.5 text-xs outline-none",
                "hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring",
                selected && "bg-foreground/[0.08]",
              )}
            >
              <Checkbox
                aria-label={`Mark ${file.path} as ${isViewed ? "not viewed" : "viewed"}`}
                checked={isViewed}
                onCheckedChange={() => onToggleViewed(file.key)}
                onClick={(event) => event.stopPropagation()}
                className="size-3.5 sm:size-3.5"
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        isViewed ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {name}
                    </span>
                  }
                />
                <TooltipPopup side="top">{file.path}</TooltipPopup>
              </Tooltip>
              <DiffStat additions={file.additions} deletions={file.deletions} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
