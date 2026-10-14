/**
 * The row-level rendering of the PR diff file tree: one directory level (`TreeLevel`, recursive)
 * and the flat path list. Kept apart from the pane's chrome so the tree stays a small, focused
 * unit.
 */
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon } from "lucide-react";

import { cn } from "~/lib/utils";

import { DiffExplorerFileRow } from "./t3team-DiffExplorerFileRow";
import {
  diffExplorerFileCount,
  type DiffExplorerFile,
  type DiffExplorerNode,
} from "./t3team-prDiffExplorer.logic";

const TREE_ARIA_LABEL = "Pull request files";

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
      aria-label={depth === 0 ? TREE_ARIA_LABEL : undefined}
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
                <span className="shrink-0 text-3xs tabular-nums text-muted-foreground/70">
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
        return (
          <li key={file.key}>
            <DiffExplorerFileRow
              file={file}
              selected={file.key === selectedKey}
              viewed={viewed.has(file.key)}
              showFullPath={false}
              onSelect={onSelectFile}
              onToggleViewed={onToggleViewed}
            />
          </li>
        );
      })}
    </ul>
  );
}

export interface DiffExplorerPathListProps {
  readonly files: readonly DiffExplorerFile[];
  readonly selectedKey: string | null;
  readonly viewed: ReadonlySet<string>;
  readonly onSelectFile: (key: string) => void;
  readonly onToggleViewed: (key: string) => void;
}

/** Every file with its whole path, wrapped rather than cut off, for reading where a file lives. */
export function PathList({
  files,
  selectedKey,
  viewed,
  onSelectFile,
  onToggleViewed,
}: DiffExplorerPathListProps) {
  return (
    <ul role="tree" aria-label={TREE_ARIA_LABEL}>
      {files.map((file) => (
        <li key={file.key}>
          <DiffExplorerFileRow
            file={file}
            selected={file.key === selectedKey}
            viewed={viewed.has(file.key)}
            showFullPath
            onSelect={onSelectFile}
            onToggleViewed={onToggleViewed}
          />
        </li>
      ))}
    </ul>
  );
}
