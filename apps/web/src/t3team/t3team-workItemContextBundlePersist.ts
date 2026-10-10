import type { ProjectShellProject } from "@t3tools/project-context";
import { buildJiraTicketEntryPoint } from "@t3tools/project-context/t3teamContextPaths";

import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { persistContextAttachmentPayload } from "~/t3team/t3team-contextAttachmentSyncPersist";
import type { T3TeamDirectoryBundlePayload } from "~/t3team/t3team-contextDirectoryBundle";
import { buildServerOwnedWorkItemContextBundle } from "~/t3team/t3team-refreshWorkItemContextBundle";

/**
 * Persists a work item's context bundle to `.t3team/context/jira/<project>/items/<key>/` through
 * the add-to-chat persist machinery.
 *
 * The server fetches and writes the bundle content (`refreshWorkItemContext`); the add-to-chat
 * persist path then records the entrypoint snapshot, so a chip attached from the composer has the
 * same on-disk result as one attached from the sidebar. `dedupeKey` is the payload's own
 * canonical key — request and payload must agree or the same ticket lands as two chips.
 */
export async function persistWorkItemContextBundle(input: {
  readonly backend: BackendApi;
  readonly project: ProjectShellProject;
  /** The work item's display key (e.g. `NXAI-8`), never its title. */
  readonly ticketKey: string;
  readonly targetLabel?: string;
  readonly summaryItems?: ReadonlyArray<{ label: string; value: string }>;
  readonly force?: boolean;
  readonly onProgress?: ((input: { relativePath?: string | undefined }) => void) | undefined;
}): Promise<T3TeamDirectoryBundlePayload> {
  const workspaceRoot = input.project.workspace?.rootPath;
  if (!workspaceRoot) {
    throw new Error("Attached context requires a managed project workspace.");
  }

  const result = await input.backend.projectWorkspace.refreshWorkItemContext({
    workspaceRoot,
    projectId: input.project.id,
    ticketKey: input.ticketKey,
    ...(input.force ? { force: true } : {}),
  });

  const payload = buildServerOwnedWorkItemContextBundle({
    projectId: input.project.id,
    ticketKey: result.ticketKey,
    targetLabel: input.targetLabel ?? result.ticketKey,
    summaryItems: input.summaryItems ?? [],
    entryPointRelativePath:
      result.entryPointRelativePath ??
      buildJiraTicketEntryPoint(input.project.id, result.ticketKey),
  });

  const request: AddToChatRequest = {
    projectId: input.project.id,
    projectTitle: input.project.title,
    projectWorkspaceRoot: workspaceRoot,
    targetLabel: input.targetLabel ?? result.ticketKey,
    targetType: "work-item",
    kind: "jira-work-item",
    dedupeKey: payload.dedupeKey,
    payload,
  };
  await persistContextAttachmentPayload({
    backend: input.backend,
    request,
    payload,
    startedAt: new Date().toISOString(),
    onProgress: (progress) => input.onProgress?.({ relativePath: progress.relativePath }),
  });

  return payload;
}
