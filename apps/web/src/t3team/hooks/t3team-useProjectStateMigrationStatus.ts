import type { ProjectStateMigration } from "@t3tools/contracts";

import { usePolledStatus } from "~/t3team/hooks/t3team-usePolledStatus";

export function isStateMigrationActive(migration: ProjectStateMigration | null): boolean {
  return migration?.status === "pending" || migration?.status === "running";
}

/**
 * The state migration a main-repository switch handed to a thread, for the workspace it migrates
 * into. Polls while it is pending or running, and again after `refresh()` (call it after a save
 * that switched the main repository).
 */
export function useProjectStateMigrationStatus(input: {
  readonly workspaceRoot: string | undefined;
  readonly enabled: boolean;
}) {
  const { value: migration, refresh } = usePolledStatus<ProjectStateMigration | null>({
    key: input.workspaceRoot,
    enabled: input.enabled,
    initial: null,
    read: async (backend, workspaceRoot) =>
      (await backend.projectWorkspace.readMainRepositoryMigrationStatus({ workspaceRoot }))
        .migration,
    isActive: isStateMigrationActive,
  });
  return { migration, refresh };
}
