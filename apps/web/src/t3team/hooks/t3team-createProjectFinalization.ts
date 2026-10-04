import type { ProjectShellProject } from "@t3tools/project-context";

import type { T3TeamProfile } from "@t3tools/t3team-skill-packs";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { syncProjectWorkspaceContext } from "~/t3team/t3team-projectWorkspaceSync";
import { randomUUID } from "~/lib/utils";
import { getConfiguredDefaultModelSelection } from "~/t3team-configuredDefaultModelSelection";

import { applyWorkspaceBootstrapToProject } from "./t3team-createProjectBootstrap";
import { applyMainRepositoryAutoDetection } from "./t3team-projectMainRepository";
import { isWorkProject } from "~/t3team/t3team-isWorkProject";
import { toSourceBindingCommand } from "~/t3team/t3team-projectSourceBinding";
import { isDuplicateProjectBindingError } from "~/t3team/chat/t3team-duplicateThreadCreateError";

export async function finalizeCreatedProject(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  linkedRepositoryUrls: ReadonlyArray<string>;
  setupProfileId: string;
  customProfile?: T3TeamProfile | undefined;
}): Promise<ProjectShellProject> {
  if (!input.project.workspace?.rootPath) {
    throw new Error("Created project is missing a managed workspace root.");
  }

  try {
    await input.backend.dispatchCommand({
      type: "project.create",
      commandId: randomUUID() as any,
      projectId: input.project.id as any,
      title: input.project.title,
      workspaceRoot: input.project.workspace.rootPath,
      createWorkspaceRootIfMissing: true,
      defaultModelSelection: getConfiguredDefaultModelSelection(),
      createdAt: new Date().toISOString(),
      source: toSourceBindingCommand(input.project.source),
    });
  } catch (error) {
    if (isDuplicateProjectBindingError(error)) {
      throw new Error("This project is already added", { cause: error });
    }
    throw error;
  }

  if (!isWorkProject(input.project)) {
    // A loose local workspace is the user's own folder — finalizing it must not scaffold
    // agent-instruction files (AGENTS.md/CLAUDE.md) or a managed .gitignore into their repo. Only
    // work projects (Jira/Linear/GitHub/managed sources) receive project setup. The project record
    // is already created above; there is simply nothing to scaffold. See t3team-isWorkProject.
    return input.project;
  }

  try {
    const bootstrap = await input.backend.projectWorkspace.bootstrapWorkspace({
      workspaceRoot: input.project.workspace.rootPath,
      linkedRepositoryUrls: input.linkedRepositoryUrls,
      setupProfileId: input.setupProfileId,
      ...(input.customProfile ? { customProfile: input.customProfile } : {}),
    });
    const bootstrappedProject = await applyMainRepositoryAutoDetection({
      backend: input.backend,
      project: applyWorkspaceBootstrapToProject(input.project, bootstrap),
      bootstrap,
    });
    try {
      await syncProjectWorkspaceContext({
        backend: input.backend,
        project: bootstrappedProject,
        linkedRepositoryUrls: input.linkedRepositoryUrls,
        projectTickets: [],
        setupProfileId: input.setupProfileId,
        // A detected main repository moved the workspace: scaffold the new root.
        ensureBootstrap:
          bootstrappedProject.workspace?.rootPath !== input.project.workspace.rootPath,
      });
    } catch {
      return bootstrappedProject;
    }
    return bootstrappedProject;
  } catch {
    return input.project;
  }
}
