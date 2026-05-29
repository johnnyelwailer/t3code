import { DEFAULT_MODEL, ProviderInstanceId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import { syncProjectWorkspaceContext } from "~/t3work/t3work-projectWorkspaceSync";
import { randomUUID } from "~/lib/utils";

import { applyWorkspaceBootstrapToProject } from "./t3work-createProjectBootstrap";

export async function finalizeCreatedProject(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  linkedRepositoryUrls: ReadonlyArray<string>;
  setupProfileId: string;
}): Promise<ProjectShellProject> {
  if (!input.project.workspace?.rootPath) {
    throw new Error("Created project is missing a managed workspace root.");
  }

  await input.backend.dispatchCommand({
    type: "project.create",
    commandId: randomUUID() as any,
    projectId: input.project.id as any,
    title: input.project.title,
    workspaceRoot: input.project.workspace.rootPath,
    createWorkspaceRootIfMissing: true,
    defaultModelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: DEFAULT_MODEL,
    },
    createdAt: new Date().toISOString(),
  });

  try {
    const bootstrap = await input.backend.projectWorkspace.bootstrapWorkspace({
      workspaceRoot: input.project.workspace.rootPath,
      linkedRepositoryUrls: input.linkedRepositoryUrls,
      setupProfileId: input.setupProfileId,
    });
    const bootstrappedProject = applyWorkspaceBootstrapToProject(input.project, bootstrap);
    try {
      await syncProjectWorkspaceContext({
        backend: input.backend,
        project: bootstrappedProject,
        linkedRepositoryUrls: input.linkedRepositoryUrls,
        projectTickets: [],
        setupProfileId: input.setupProfileId,
        ensureBootstrap: false,
      });
    } catch {
      return bootstrappedProject;
    }
    return bootstrappedProject;
  } catch {
    return input.project;
  }
}
