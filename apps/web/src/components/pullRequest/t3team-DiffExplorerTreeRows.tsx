import { DiffExplorerFileRow } from "./t3team-DiffExplorerFileRow";
import type { DiffExplorerFile } from "./t3team-prDiffExplorer.logic";
const TREE_ARIA_LABEL = "Pull request files";

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
