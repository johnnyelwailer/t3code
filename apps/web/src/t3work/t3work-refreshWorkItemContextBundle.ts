import type { ProjectShellProject } from "@t3tools/project-context";
import {
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
} from "@t3tools/project-context/t3workContextPaths";

import type { AddToChatPayloadProgressUpdate } from "~/t3work/t3work-addToChatUtils";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { T3WorkDirectoryBundlePayload } from "~/t3work/t3work-contextDirectoryBundle";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { T3workWorkItemContextRefreshResult } from "~/t3work/t3work-workItemContextRefreshTypes";

export function buildServerOwnedWorkItemContextBundle(input: {
  readonly projectId: string;
  readonly ticketKey: string;
  readonly targetLabel: string;
  readonly summaryItems: ReadonlyArray<{ label: string; value: string }>;
  readonly entryPointRelativePath: string;
}): T3WorkDirectoryBundlePayload {
  const bundleRootRelativePath = buildJiraTicketCacheRoot(input.projectId, input.ticketKey);
  const references = [{ label: "Ticket entrypoint", relativePath: input.entryPointRelativePath }];
  return {
    kind: "t3work-directory-bundle",
    dedupeKey: `${input.projectId}:${input.ticketKey}:work-item`,
    bundleRootRelativePath,
    files: [],
    fileReferences: references,
    lightweightItem: {
      kind: "jira-work-item",
      label: input.targetLabel,
      summaryItems: input.summaryItems,
      references,
    },
  };
}

export async function refreshWorkItemContextBundle(input: {
  readonly backend: BackendApi;
  readonly project: ProjectShellProject;
  readonly ticket: ProjectTicket;
  readonly summaryItems: ReadonlyArray<{ label: string; value: string }>;
  readonly force?: boolean;
  readonly onProgress?: ((update: AddToChatPayloadProgressUpdate) => void) | undefined;
}): Promise<T3WorkDirectoryBundlePayload> {
  const workspaceRoot = input.project.workspace?.rootPath;
  if (!workspaceRoot) {
    throw new Error("Attached context requires a managed project workspace.");
  }

  input.onProgress?.({
    phase: "Refreshing work item context",
    progressCurrent: 0,
    progressTotal: 1,
    syncInfo: {
      contentLabel: "Jira work item context",
      currentItemLabel: `${input.ticket.ref.displayId} ${input.ticket.ref.title}`,
      currentItemDetail: input.project.title,
    },
  });

  const result: T3workWorkItemContextRefreshResult =
    await input.backend.projectWorkspace.refreshWorkItemContext({
      workspaceRoot,
      projectId: input.project.id,
      ticketKey: input.ticket.ref.displayId,
      ...(input.force ? { force: true } : {}),
    });

  input.onProgress?.({
    phase:
      result.status === "already_synced"
        ? "Using cached work item context"
        : "Work item context refreshed",
    progressCurrent: 1,
    progressTotal: 1,
    syncInfo: {
      contentLabel: "Jira work item context",
      currentItemLabel: result.ticketKey,
      currentItemDetail:
        result.status === "synced"
          ? `${result.includedCount} item${result.includedCount === 1 ? "" : "s"} synced`
          : "Already synced",
    },
  });

  return buildServerOwnedWorkItemContextBundle({
    projectId: input.project.id,
    ticketKey: result.ticketKey,
    targetLabel: `${input.ticket.ref.displayId} ${input.ticket.ref.title}`,
    summaryItems: input.summaryItems,
    entryPointRelativePath:
      result.entryPointRelativePath ??
      buildJiraTicketEntryPoint(input.project.id, result.ticketKey),
  });
}
