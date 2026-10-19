/**
 * Saving a project's linked repositories (and, behind `NEXI_FF_MAIN_REPOSITORY`, its main
 * repository): record the workspace references, then either apply the user's main-repository
 * choice or let auto-detection run on the linked clones already on disk. Linked repositories sync
 * on demand, so a save clones only the repository chosen as the main one.
 */
import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  applyWorkspaceBootstrapToProject,
  replaceLinkedRepositoryUrlsInProject,
} from "~/t3team/hooks/t3team-createProjectBootstrap";
import type { LinkedRepositorySavePhase } from "~/t3team/components/t3team-linkedRepositorySyncSteps";
import { waitForLinkedRepositoryReady } from "~/t3team/hooks/t3team-waitForLinkedRepositoryReady";
import {
  applyMainRepositoryAutoDetection,
  applyMainRepositorySwitchToProject,
} from "~/t3team/hooks/t3team-projectMainRepository";

export async function saveProjectRepositories(input: {
  readonly backend: BackendApi | null;
  readonly project: ProjectShellProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  /** The branch each linked repository's checkout should be on, by URL; absent: left as is. */
  readonly linkedRepositoryBranches?: Readonly<Record<string, string>>;
  /** The user's main-repository choice; `undefined` = unchanged (auto-detection may apply). */
  readonly mainRepositoryUrl?: string | null;
  /** Called once the list is saved and syncs are queued, before any wait for a clone. */
  readonly onSaved?: (project: ProjectShellProject) => void;
  /** Where the save is, for a progress view; called as each phase begins. */
  readonly onPhase?: (phase: LinkedRepositorySavePhase) => void;
}): Promise<ProjectShellProject> {
  const { backend, linkedRepositoryUrls } = input;
  const phase = (next: LinkedRepositorySavePhase) => input.onPhase?.(next);
  phase("saving");
  let project = replaceLinkedRepositoryUrlsInProject(input.project, linkedRepositoryUrls);
  if (!backend || !project.workspace?.rootPath) return project;

  // Returns at once: the main repository's clone runs in the background on the server; the
  // dialog shows its progress through `readLinkedRepositoryStatus`.
  const bootstrap = await backend.projectWorkspace.bootstrapWorkspace({
    workspaceRoot: project.workspace.rootPath,
    linkedRepositoryUrls,
    ...(input.linkedRepositoryBranches
      ? { linkedRepositoryBranches: input.linkedRepositoryBranches }
      : {}),
    ...(typeof input.mainRepositoryUrl === "string"
      ? { syncLinkedRepositoryUrls: [input.mainRepositoryUrl] }
      : {}),
  });
  project = applyWorkspaceBootstrapToProject(project, bootstrap);
  if (linkedRepositoryUrls.length === 0) {
    project = replaceLinkedRepositoryUrlsInProject(project, []);
  }

  if (input.mainRepositoryUrl === undefined) {
    phase("scaffolding");
    const detected = await applyMainRepositoryAutoDetection({ backend, project, bootstrap });
    phase("saved");
    return detected;
  }
  input.onSaved?.(project);
  // The switch needs the chosen repository's checkout; its first clone may still be running.
  if (input.mainRepositoryUrl !== null) {
    phase("waiting-for-main");
    await waitForLinkedRepositoryReady({
      backend,
      workspaceRoot: bootstrap.workspaceRoot,
      url: input.mainRepositoryUrl,
    });
  }
  phase("switching-main");
  const result = await backend.projectWorkspace.setMainRepository({
    projectId: project.id,
    url: input.mainRepositoryUrl,
    selection: "user",
  });
  if (!result.changed) {
    phase("saved");
    return project;
  }
  project = applyMainRepositorySwitchToProject(project, result);
  phase("scaffolding");
  // Scaffold the new workspace (setup files live at the workspace root, outside the state dir).
  const rooted = await backend.projectWorkspace.bootstrapWorkspace({
    workspaceRoot: result.workspaceRoot,
    linkedRepositoryUrls,
    ...(input.linkedRepositoryBranches
      ? { linkedRepositoryBranches: input.linkedRepositoryBranches }
      : {}),
  });
  phase("saved");
  return applyWorkspaceBootstrapToProject(project, rooted);
}
