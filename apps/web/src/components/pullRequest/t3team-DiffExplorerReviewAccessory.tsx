import { diffExplorerViewedState } from "./t3team-prDiffExplorer.directoryViewed";
import type { DiffExplorerFile } from "./t3team-prDiffExplorer.logic";

/** Slotted into a Pierre row; capture keeps checkbox clicks out of its selection handlers. */
export function DiffExplorerReviewAccessory({
  path,
  directory,
  directoryCheckbox,
  file,
  descendants,
  viewed,
  changed,
  onToggleViewed,
  onToggleDirectoryViewed,
}: {
  readonly path: string;
  readonly directory: boolean;
  readonly directoryCheckbox: boolean;
  readonly file?: DiffExplorerFile | undefined;
  readonly descendants: readonly DiffExplorerFile[];
  readonly viewed: ReadonlySet<string>;
  readonly changed: ReadonlySet<string>;
  readonly onToggleViewed: (key: string) => void;
  readonly onToggleDirectoryViewed: (path: string) => void;
}) {
  const state = directory
    ? diffExplorerViewedState(
        descendants.map((file) => file.key),
        viewed,
      )
    : file && viewed.has(file.key)
      ? "all"
      : "none";
  const stale = file !== undefined && changed.has(file.key);
  const label = directory
    ? `Mark all files in ${path.replace(/\/$/, "")} as ${state === "all" ? "not viewed" : "viewed"}`
    : `Mark ${path} as ${state === "all" ? "not viewed" : "viewed"}`;
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs tabular-nums">
      {directory ? (
        <span>{descendants.length}</span>
      ) : file ? (
        <>
          <span className="text-diff-addition-foreground">+{file.additions}</span>
          <span className="text-diff-deletion-foreground">-{file.deletions}</span>
        </>
      ) : null}
      {stale ? <span aria-label="Changed since you viewed it">&#8635;</span> : null}
      {!directory || directoryCheckbox ? (
        <button
          type="button"
          role="checkbox"
          aria-label={label}
          aria-checked={state === "partial" ? "mixed" : state === "all"}
          className="inline-flex size-3.5 items-center justify-center rounded-xs border border-current text-2xs"
          onKeyDownCapture={(event) => {
            if (event.key === " " || event.key === "Enter") event.stopPropagation();
          }}
          onClickCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (directory) onToggleDirectoryViewed(path.endsWith("/") ? path : `${path}/`);
            else if (file) onToggleViewed(file.key);
          }}
        >
          {state === "partial" ? "-" : state === "all" ? <>&#10003;</> : null}
        </button>
      ) : null}
    </span>
  );
}
