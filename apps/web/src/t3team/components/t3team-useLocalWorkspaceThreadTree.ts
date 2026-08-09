import { useMemo, useState } from "react";

import type { ProjectThread, ThreadSortOrder } from "~/t3team/t3team-types";
import { sortThreads } from "./t3team-projectSidebarShared";
import {
  buildProjectSidebarThreadTree,
  countProjectSidebarThreadBranches,
} from "./t3team-projectSidebarThreadTree";

/**
 * Everything a local-workspace row needs to know about *which* threads to draw: sort, build the
 * parent/child tree, cut it to the preview length, and count what the cut hid.
 *
 * Extracted from `t3team-LocalWorkspaceSidebarRow.tsx` alongside `useLocalWorkspaceRowState` (which
 * owns rename/menu state) so the row component is left as markup. The four values are derived in
 * sequence and the "+N more" toggle feeds back into the cut, so they are one unit rather than four
 * independent memos — splitting them across the component let the count and the list disagree.
 */
export function useLocalWorkspaceThreadTree(input: {
  readonly projectThreads: ReadonlyArray<ProjectThread>;
  readonly threadSortOrder: ThreadSortOrder;
  readonly threadPreviewCount: number;
}) {
  const { projectThreads, threadSortOrder, threadPreviewCount } = input;
  const [showAllThreads, setShowAllThreads] = useState(false);

  const sortedProjectThreads = useMemo(
    () => sortThreads([...projectThreads], threadSortOrder),
    [projectThreads, threadSortOrder],
  );
  const threadTree = useMemo(
    () => buildProjectSidebarThreadTree(sortedProjectThreads),
    [sortedProjectThreads],
  );

  const visibleRootThreads = showAllThreads
    ? threadTree.rootThreads
    : threadTree.rootThreads.slice(0, threadPreviewCount);
  // Branches, not roots: a collapsed root still renders its descendants, so counting roots would
  // report far more hidden threads than the "+N more" button actually reveals.
  const visibleThreadCount = countProjectSidebarThreadBranches(visibleRootThreads, threadTree);

  return {
    sortedProjectThreads,
    threadTree,
    visibleRootThreads,
    hiddenThreadCount: Math.max(0, sortedProjectThreads.length - visibleThreadCount),
    showAllThreads,
    toggleShowAllThreads: () => setShowAllThreads((current) => !current),
  };
}
