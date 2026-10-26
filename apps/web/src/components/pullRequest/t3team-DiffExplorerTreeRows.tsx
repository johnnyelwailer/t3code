/**
 * The row-level rendering of the PR diff file tree: one directory level (`TreeLevel`, recursive)
 * and the flat path list. Kept apart from the pane's chrome so the tree stays a small, focused
 * unit.
 */
import { cn } from "~/lib/utils";

import { DiffExplorerDirectoryRow } from "./t3team-DiffExplorerDirectoryRow";
import { DiffExplorerFileRow } from "./t3team-DiffExplorerFileRow";
import type { DiffExplorerFile, DiffExplorerNode } from "./t3team-prDiffExplorer.logic";

const TREE_ARIA_LABEL = "Pull request files";

export interface DiffExplorerTreeLevelProps {
  readonly nodes: readonly DiffExplorerNode[];
  readonly depth: number;
  readonly selectedKey: string | null;
  readonly viewed: ReadonlySet<string>;
  readonly changed: ReadonlySet<string>;
  readonly openDirectories: ReadonlySet<string>;
  readonly onSelectFile: (key: string) => void;
  readonly onToggleViewed: (key: string) => void;
  readonly onToggleDirectory: (path: string) => void;
  readonly onToggleDirectoryViewed: (path: string) => void;
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
  changed,
  openDirectories,
  onSelectFile,
  onToggleViewed,
  onToggleDirectory,
  onToggleDirectoryViewed,
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
              <DiffExplorerDirectoryRow
                node={node}
                open={open}
                viewed={viewed}
                onToggleOpen={() => onToggleDirectory(node.path)}
                onToggleViewed={() => onToggleDirectoryViewed(node.path)}
              />
              {open ? (
                <TreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  selectedKey={selectedKey}
                  viewed={viewed}
                  changed={changed}
                  openDirectories={openDirectories}
                  onSelectFile={onSelectFile}
                  onToggleViewed={onToggleViewed}
                  onToggleDirectory={onToggleDirectory}
                  onToggleDirectoryViewed={onToggleDirectoryViewed}
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
              changed={changed.has(file.key)}
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
  readonly changed: ReadonlySet<string>;
  readonly onSelectFile: (key: string) => void;
  readonly onToggleViewed: (key: string) => void;
}

/** Every file with its whole path, wrapped rather than cut off, for reading where a file lives. */
export function PathList({
  files,
  selectedKey,
  viewed,
  changed,
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
            changed={changed.has(file.key)}
            showFullPath
            onSelect={onSelectFile}
            onToggleViewed={onToggleViewed}
          />
        </li>
      ))}
    </ul>
  );
}
