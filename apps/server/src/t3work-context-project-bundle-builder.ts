import { T3WORK_CONTEXT_AVAILABILITY_SUMMARY } from "@t3tools/project-context/t3workContextAvailability";
import {
  buildContextManifestPath,
  buildContextMetadataPath,
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
  buildProjectContextCacheRoot,
  buildProjectContextEntryPoint,
  sanitizePathSegment,
} from "@t3tools/project-context/t3workContextPaths";
import {
  compactJson,
  type T3WorkDirectoryBundleFile,
} from "@t3tools/project-context/t3workDirectoryBundle";
import type { ProjectShellProject } from "@t3tools/project-context";
import * as DateTime from "effect/DateTime";

import {
  buildT3workContextTicketSummary,
  resolveT3workContextTicketKey,
  type T3workContextTicket,
} from "./t3work-context-ticket.ts";

export type T3workProjectBundleBuildResult = {
  readonly files: ReadonlyArray<T3WorkDirectoryBundleFile>;
  readonly entryPointRelativePath: string;
  readonly manifestRelativePath: string;
  readonly workItemCount: number;
};

function writeJson(files: T3WorkDirectoryBundleFile[], relativePath: string, value: unknown): void {
  files.push({ relativePath, contents: compactJson(value) });
}

export function buildT3workProjectContextBundle(input: {
  readonly project: ProjectShellProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly tickets: ReadonlyArray<T3workContextTicket>;
}): T3workProjectBundleBuildResult {
  const root = buildProjectContextCacheRoot(input.project.id);
  const entryPointRelativePath = buildProjectContextEntryPoint(input.project.id);
  const manifestRelativePath = buildContextManifestPath(root);
  const files: T3WorkDirectoryBundleFile[] = [];

  writeJson(files, buildContextMetadataPath(root), {
    project: input.project,
    linkedRepositoryUrls: input.linkedRepositoryUrls,
  });
  writeJson(files, `${root}/linked-repositories.json`, {
    linkedRepositoryUrls: input.linkedRepositoryUrls,
  });

  const syncedAt = DateTime.formatIso(DateTime.nowUnsafe());
  const workItems = input.tickets.map((ticket) => {
    const ticketKey = resolveT3workContextTicketKey(ticket);
    const relativePath = `${root}/work-items/${sanitizePathSegment(ticketKey)}.json`;
    const fullBundleRootRelativePath = buildJiraTicketCacheRoot(input.project.id, ticketKey);
    const ticketEntryPointRelativePath = buildJiraTicketEntryPoint(input.project.id, ticketKey);
    writeJson(files, relativePath, {
      ticket,
      summaryItems: buildT3workContextTicketSummary(ticket),
      ticketEntryPointRelativePath,
      availability: T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
      loadableOnDemand: true,
      fullBundleRootRelativePath,
    });
    return {
      key: ticketKey,
      relativePath,
      ticketEntryPointRelativePath,
      fullBundleRootRelativePath,
      availability: T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
      loadableOnDemand: true,
      updatedAt: syncedAt,
    };
  });

  writeJson(files, `${root}/work-items/index.json`, { workItems });
  writeJson(files, manifestRelativePath, {
    kind: "project-context-manifest",
    syncedAt,
    projectId: input.project.id,
    entryPointRelativePath,
    contextAvailabilityGuide: {
      summary: "Lightweight work-item JSON under work-items/*.json; full bundles load on demand.",
      full: "Rich per-item trees under jira/<project>/items/<key>/ after refresh.",
      onDemandTool: "t3work.work_item.refresh_context_bundle",
    },
    workItemCount: workItems.length,
  });
  writeJson(files, entryPointRelativePath, {
    kind: "project",
    label: input.project.title,
    summaryItems: [
      { label: "Work items", value: String(workItems.length) },
      { label: "Linked repositories", value: String(input.linkedRepositoryUrls.length) },
    ],
    contextAvailabilityGuide: {
      summary: "work-items/*.json",
      full: "jira/<project>/items/<key>/",
      onDemandTool: "t3work.work_item.refresh_context_bundle",
    },
    paths: {
      manifest: manifestRelativePath,
      metadata: buildContextMetadataPath(root),
      linkedRepositories: `${root}/linked-repositories.json`,
      workItemsIndex: `${root}/work-items/index.json`,
    },
  });

  return {
    files,
    entryPointRelativePath,
    manifestRelativePath,
    workItemCount: workItems.length,
  };
}
