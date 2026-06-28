import type { ProjectShellProject } from "@t3tools/project-context";
import {
  buildJiraTicketCacheRoot,
  buildJiraTicketFocusEntryPoint,
} from "@t3tools/project-context/t3workContextPaths";

import type { AddToChatPayloadProgressUpdate } from "~/t3work/t3work-addToChatUtils";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { T3WorkDirectoryBundlePayload } from "~/t3work/t3work-contextDirectoryBundle";
import type { ProjectTicket } from "~/t3work/t3work-types";
import type { T3workWorkItemSliceContextRefreshResult } from "~/t3work/t3work-workItemContextRefreshTypes";
import type { TicketDetailContextTarget } from "~/t3work/t3work-ticketDetailContextBundle";

function jiraDetailKind(target: TicketDetailContextTarget): string {
  return `jira-ticket-${target}`;
}

export function buildServerOwnedTicketDetailContextBundle(input: {
  readonly projectId: string;
  readonly ticketKey: string;
  readonly focusKind: string;
  readonly targetLabel: string;
  readonly summaryItems: ReadonlyArray<{ label: string; value: string }>;
  readonly focusEntryPointRelativePath: string;
  readonly ticketEntryPointRelativePath: string;
  readonly attachmentIndexRelativePath?: string;
}): T3WorkDirectoryBundlePayload {
  const bundleRootRelativePath = buildJiraTicketCacheRoot(input.projectId, input.ticketKey);
  const references = [
    { label: "Focused context", relativePath: input.focusEntryPointRelativePath },
    ...(input.attachmentIndexRelativePath
      ? [{ label: "Attachment index", relativePath: input.attachmentIndexRelativePath }]
      : []),
    { label: "Ticket entrypoint", relativePath: input.ticketEntryPointRelativePath },
  ];
  return {
    kind: "t3work-directory-bundle",
    dedupeKey: `${input.projectId}:${input.ticketKey}:${input.focusKind}`,
    bundleRootRelativePath,
    files: [],
    fileReferences: references,
    lightweightItem: {
      kind: input.focusKind,
      label: input.targetLabel,
      summaryItems: input.summaryItems,
      references,
    },
  };
}

export async function refreshTicketDetailContextBundle(input: {
  readonly backend: BackendApi;
  readonly project: ProjectShellProject;
  readonly ticket: ProjectTicket;
  readonly target: TicketDetailContextTarget;
  readonly targetLabel: string;
  readonly summaryItems?: ReadonlyArray<{ label: string; value: string }>;
  readonly force?: boolean;
  readonly onProgress?: ((update: AddToChatPayloadProgressUpdate) => void) | undefined;
}): Promise<T3WorkDirectoryBundlePayload> {
  const workspaceRoot = input.project.workspace?.rootPath;
  if (!workspaceRoot) {
    throw new Error("Attached context requires a managed project workspace.");
  }

  const focusKind = jiraDetailKind(input.target);
  const summaryItems = input.summaryItems ?? [];

  input.onProgress?.({
    phase: "Refreshing ticket detail context",
    progressCurrent: 0,
    progressTotal: 1,
    syncInfo: {
      contentLabel: "Jira ticket detail context",
      currentItemLabel: input.targetLabel,
      currentItemDetail: input.project.title,
    },
  });

  const result: T3workWorkItemSliceContextRefreshResult =
    await input.backend.projectWorkspace.refreshWorkItemSliceContext({
      workspaceRoot,
      projectId: input.project.id,
      ticketKey: input.ticket.ref.displayId,
      focusKind,
      focusLabel: input.targetLabel,
      summaryItems,
      ...(input.force ? { force: true } : {}),
    });

  input.onProgress?.({
    phase:
      result.status === "already_synced"
        ? "Using cached ticket detail context"
        : "Ticket detail context refreshed",
    progressCurrent: 1,
    progressTotal: 1,
    syncInfo: {
      contentLabel: "Jira ticket detail context",
      currentItemLabel: input.targetLabel,
      currentItemDetail:
        result.status === "synced"
          ? `${result.includedCount} item${result.includedCount === 1 ? "" : "s"} synced`
          : "Already synced",
    },
  });

  return buildServerOwnedTicketDetailContextBundle({
    projectId: input.project.id,
    ticketKey: result.ticketKey,
    focusKind,
    targetLabel: input.targetLabel,
    summaryItems,
    focusEntryPointRelativePath:
      result.focusEntryPointRelativePath ??
      buildJiraTicketFocusEntryPoint({
        projectId: input.project.id,
        ticketKey: result.ticketKey,
        focus: focusKind,
      }),
    ticketEntryPointRelativePath: result.entryPointRelativePath,
    ...(result.attachmentIndexRelativePath
      ? { attachmentIndexRelativePath: result.attachmentIndexRelativePath }
      : {}),
  });
}
