/**
 * Saving a project's linked repositories (and, behind `NEXI_FF_MAIN_REPOSITORY`, its main
 * repository): refresh the workspace references, then either apply the user's main-repository
 * choice or let auto-detection run on the freshly linked clones.
 */
import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  applyWorkspaceBootstrapToProject,
  replaceLinkedRepositoryUrlsInProject,
} from "~/t3team/hooks/t3team-createProjectBootstrap";
import {
  applyMainRepositoryAutoDetection,
  applyMainRepositorySwitchToProject,
} from "~/t3team/hooks/t3team-projectMainRepository";

export async function saveProjectRepositories(input: {
  readonly backend: BackendApi | null;
  readonly project: ProjectShellProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  /** The user's main-repository choice; `undefined` = unchanged (auto-detection may apply). */
  readonly mainRepositoryUrl?: string | null;
}): Promise<ProjectShellProject> {
  const { backend, linkedRepositoryUrls } = input;
  let project = replaceLinkedRepositoryUrlsInProject(input.project, linkedRepositoryUrls);
  if (!backend || !project.workspace?.rootPath) return project;

  const bootstrap = await backend.projectWorkspace.bootstrapWorkspace({
    workspaceRoot: project.workspace.rootPath,
    linkedRepositoryUrls,
  });
  project = applyWorkspaceBootstrapToProject(project, bootstrap);
  if (linkedRepositoryUrls.length === 0) {
    project = replaceLinkedRepositoryUrlsInProject(project, []);
  }

  if (input.mainRepositoryUrl === undefined) {
    return applyMainRepositoryAutoDetection({ backend, project, bootstrap });
  }
  const result = await backend.projectWorkspace.setMainRepository({
    projectId: project.id,
    url: input.mainRepositoryUrl,
    selection: "user",
  });
  if (!result.changed) return project;
  project = applyMainRepositorySwitchToProject(project, result);
  // Scaffold the new workspace (setup files live at the workspace root, outside the state dir).
  const rooted = await backend.projectWorkspace.bootstrapWorkspace({
    workspaceRoot: result.workspaceRoot,
    linkedRepositoryUrls,
  });
  return applyWorkspaceBootstrapToProject(project, rooted);
}
