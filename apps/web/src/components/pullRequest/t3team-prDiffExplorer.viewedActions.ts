import {
  diffExplorerFilesUnder,
  diffExplorerPressChanges,
  diffExplorerViewedState,
  toggleDirectoryViewedKeys,
} from "./t3team-prDiffExplorer.directoryViewed";
import {
  markAllFilesViewed,
  toggleViewedFile,
  type DiffExplorerFile,
} from "./t3team-prDiffExplorer.logic";
import type { PullRequestFilesViewedView } from "./usePullRequestFilesViewed";

const NO_KEYS: ReadonlySet<string> = new Set();

type HostViewed = Pick<PullRequestFilesViewedView, "enabled" | "isViewed" | "isTicked" | "isStale">;

/**
 * The explorer's ticks. Where the host keeps a viewed state (GitHub's own, or the environment's)
 * the tree reads and writes that one; the per-reader local set is only the fallback for an
 * environment that reports no such state, so the tree and the file headers never disagree.
 * A file pushed to since it was viewed keeps its tick and is reported in `treeChanged`.
 */
export function diffExplorerViewedActions(options: {
  readonly explorerFiles: readonly DiffExplorerFile[];
  readonly host: HostViewed;
  readonly setFileViewed: (fileKey: string, path: string, viewed: boolean) => void;
  readonly localViewed: ReadonlySet<string>;
  readonly updateLocalViewed: (change: (current: readonly string[]) => readonly string[]) => void;
}) {
  const { explorerFiles, host, setFileViewed, localViewed, updateLocalViewed } = options;
  const { enabled, isViewed, isTicked, isStale } = host;

  const treeViewed = enabled
    ? new Set(explorerFiles.filter((file) => isTicked(file.path)).map((file) => file.key))
    : localViewed;
  const treeChanged = enabled
    ? new Set(explorerFiles.filter((file) => isStale(file.path)).map((file) => file.key))
    : NO_KEYS;

  const writeToHost = (files: readonly DiffExplorerFile[], viewing: boolean) => {
    for (const file of diffExplorerPressChanges(files, viewing, { isViewed, isTicked })) {
      setFileViewed(file.key, file.path, viewing);
    }
  };

  const toggleViewed = (key: string) => {
    if (!enabled) {
      updateLocalViewed((current) => [...toggleViewedFile(new Set(current), key)]);
      return;
    }
    const file = explorerFiles.find((candidate) => candidate.key === key);
    if (file !== undefined) writeToHost([file], !isTicked(file.path));
  };
  const markAllViewed = () => {
    if (enabled) writeToHost(explorerFiles, true);
    else updateLocalViewed(() => [...markAllFilesViewed(explorerFiles)]);
  };
  const toggleDirectoryViewed = (directoryPath: string) => {
    const files = diffExplorerFilesUnder(explorerFiles, directoryPath);
    const keys = files.map((file) => file.key);
    if (enabled) {
      writeToHost(files, diffExplorerViewedState(keys, treeViewed) !== "all");
      return;
    }
    updateLocalViewed((current) => [...toggleDirectoryViewedKeys(new Set(current), keys)]);
  };

  return { treeViewed, treeChanged, toggleViewed, markAllViewed, toggleDirectoryViewed };
}
