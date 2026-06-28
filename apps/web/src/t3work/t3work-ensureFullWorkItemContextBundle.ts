import type { ProjectShellProject } from "@t3tools/project-context";
import { T3WORK_CONTEXT_AVAILABILITY_FULL } from "@t3tools/project-context/t3workContextAvailability";

import type { AddToChatPayloadProgressUpdate } from "~/t3work/t3work-addToChatUtils";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { persistDirectoryBundleToWorkspace } from "~/t3work/t3work-contextDirectoryBundlePersist";
import type { T3WorkDirectoryBundlePayload } from "~/t3work/t3work-contextDirectoryBundle";
import {
  assertContextRelativePathInProjectWorkspace,
  buildScopedJiraTicketEntryPoint,
} from "~/t3work/t3work-contextScopeValidation";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { buildTicketContextBundle } from "~/t3work/t3work-ticketContextBundle";
import type { ProjectTicket } from "~/t3work/t3work-types";

export type EnsureFullWorkItemContextBundleResult = {
  readonly bundle: T3WorkDirectoryBundlePayload;
  readonly writtenFiles: ReadonlyArray<string>;
  readonly entryPointRelativePath: string;
  readonly availability: typeof T3WORK_CONTEXT_AVAILABILITY_FULL;
  readonly syncedAt: string;
};

export async function ensureFullWorkItemContextBundle(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  ticket: ProjectTicket;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  onProgress?: ((update: AddToChatPayloadProgressUpdate) => void) | undefined;
}): Promise<EnsureFullWorkItemContextBundleResult> {
  const workspaceRoot = input.project.workspace?.rootPath;
  if (!workspaceRoot) {
    throw new Error("Attached context requires a managed project workspace.");
  }

  const bundle = await buildTicketContextBundle(input);
  const entryPointRelativePath = assertContextRelativePathInProjectWorkspace({
    projectId: input.project.id,
    relativePath:
      bundle.fileReferences.find((reference) => reference.label === "Ticket entrypoint")
        ?.relativePath ??
      buildScopedJiraTicketEntryPoint({
        projectId: input.project.id,
        ticketKey: ticketDisplayKey(input.ticket),
      }),
  });

  const writtenFiles = await persistDirectoryBundleToWorkspace({
    backend: input.backend,
    workspaceRoot,
    payload: bundle,
    ...(input.onProgress
      ? {
          onProgress: (progress) => {
            input.onProgress?.({
              phase: "Writing cached context files",
              progressCurrent: progress.completedCount,
              progressTotal: progress.totalCount,
            });
          },
        }
      : {}),
  });

  return {
    bundle,
    writtenFiles,
    entryPointRelativePath,
    availability: T3WORK_CONTEXT_AVAILABILITY_FULL,
    syncedAt: new Date().toISOString(),
  };
}

function ticketDisplayKey(ticket: ProjectTicket): string {
  return ticket.ref.displayId;
}
