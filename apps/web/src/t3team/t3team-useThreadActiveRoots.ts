/**
 * Confirms the thread's active roots with one batched metadata read. A missing folder drops
 * quietly. Dirty or unpushed worktrees are not known on the client yet and are not listed.
 */
import {
  AuthFilesystemReadScope,
  FILESYSTEM_METADATA_BATCH_LIMIT,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { isAbsolutePath, isNetworkPath } from "@t3tools/shared/path";
import {
  selectThreadActiveRoots,
  threadFollowRoot,
  threadRootCandidates,
  type ThreadActiveRoot,
  type ThreadRootShell,
} from "@t3tools/shared/t3team-threadActiveRoots";
import * as DateTime from "effect/DateTime";

import { useProjects, useThreadRelationshipShells } from "../state/entities";
import { filesystemEnvironment } from "../state/filesystem";
import { useEnvironmentQuery } from "../state/query";
import { useEnvironmentScope } from "../state/session";

function toThreadRootShell(
  shell: ReturnType<typeof useThreadRelationshipShells>[number],
): ThreadRootShell {
  const pullRequests = shell.pullRequests?.map((link) => ({
    snapshot:
      link.snapshot !== null && link.snapshot !== undefined
        ? { state: link.snapshot.state, headBranch: link.snapshot.headBranch }
        : null,
  }));
  return {
    id: shell.id,
    branch: shell.branch,
    worktreePath: shell.worktreePath,
    title: shell.title,
    lineage: { parentThreadId: shell.lineage.parentThreadId },
    activeRunId: shell.activeRunId,
    updatedAt: { epochMillis: DateTime.toEpochMillis(shell.updatedAt) },
    ...(pullRequests !== undefined ? { pullRequests } : {}),
  };
}

export interface ThreadActiveRoots {
  readonly roots: ReadonlyArray<ThreadActiveRoot>;
  /** Exactly one extra root that exists: Open in editor follows it. */
  readonly followRoot: string | null;
  /** Every listed folder was confirmed to exist (or there was nothing to check). */
  readonly confirmed: boolean;
}

export function useThreadActiveRoots(
  threadRef: ScopedThreadRef,
  cwd: string | null,
): ThreadActiveRoots {
  const shells = useThreadRelationshipShells(threadRef);
  const projects = useProjects();
  const thread = shells.find((shell) => shell.id === threadRef.threadId);
  const primaryRoot =
    projects.find(
      (project) =>
        project.environmentId === threadRef.environmentId && project.id === thread?.projectId,
    )?.workspaceRoot ?? null;
  const unchecked = selectThreadActiveRoots(
    threadRootCandidates({
      threadId: threadRef.threadId,
      shells: shells.map(toThreadRootShell),
      primaryRoot,
    }),
  );
  const canRead = useEnvironmentScope(threadRef.environmentId, AuthFilesystemReadScope);
  // Servers stat what they are asked about; never send a network path (NTLM leak).
  const paths = unchecked
    .map((root) => root.path)
    .filter((path) => isAbsolutePath(path) && !isNetworkPath(path))
    .slice(0, FILESYSTEM_METADATA_BATCH_LIMIT);
  const metadata = useEnvironmentQuery(
    canRead && paths.length > 1
      ? filesystemEnvironment.getMetadata({
          environmentId: threadRef.environmentId,
          input: { paths },
        })
      : null,
  ).data;
  if (paths.length <= 1) return { roots: unchecked, followRoot: null, confirmed: true };
  if (metadata === null) return { roots: unchecked, followRoot: null, confirmed: false };
  const existing = new Set(
    paths.filter((_, index) => metadata.entries[index]?.kind === "directory"),
  );
  const roots = unchecked.filter((root) => existing.has(root.path));
  return { roots, followRoot: threadFollowRoot(roots, cwd), confirmed: true };
}
