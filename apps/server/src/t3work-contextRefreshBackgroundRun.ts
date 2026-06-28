import type { ProjectShellProject } from "@t3tools/project-context";
import type { IntegrationProvider } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import {
  ensureT3workContextCacheTables,
  upsertT3workContextEdges,
  upsertT3workContextResource,
} from "./t3work-context-cache-tables.ts";
import { buildT3workContextAttachmentAssets } from "./t3work-context-attachment-assets.ts";
import { buildT3workWorkItemContextBundle } from "./t3work-context-bundle-builder.ts";
import { shouldContinueT3workContextBackgroundRefresh } from "./t3work-contextRefreshBackgroundBudget.ts";
import { buildT3workContextBackgroundEdges } from "./t3work-contextRefreshBackgroundEdges.ts";
import { persistT3workContextBackgroundJobBestEffort } from "./t3work-contextRefreshBackgroundPersist.ts";
import {
  enqueueT3workContextBackgroundItems,
  sortT3workContextBackgroundQueue,
  t3workContextBackgroundTargetDepth,
  type T3workContextBackgroundJob,
} from "./t3work-contextRefreshBackgroundQueue.ts";
import {
  extractT3workJiraRelationshipKeys,
  normalizeT3workJiraKey,
} from "./t3work-context-jira-relationships.ts";
import { snapshotToT3workContextTicket } from "./t3work-context-ticket.ts";
import {
  logBackgroundCompleted,
  logBackgroundItemProcessed,
} from "./t3work-contextRefreshTelemetry.ts";
import { writeT3workWorkspaceContextFiles } from "./t3work-project-workspace-context-files.ts";

type AssetProvider = IntegrationProvider & {
  readonly downloadAsset?: (
    url: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string }>;
};

function fetchSnapshot(input: {
  readonly provider: IntegrationProvider;
  readonly key: string;
  readonly externalProjectId: string;
}) {
  return Effect.promise(() =>
    input.provider.getResource({
      provider: "atlassian",
      kind: "issue",
      id: input.key,
      projectId: input.externalProjectId,
    }),
  );
}

export function runT3workContextBackgroundJob(input: {
  readonly job: T3workContextBackgroundJob;
  readonly project: ProjectShellProject;
  readonly provider: AssetProvider;
  readonly workspaceRoot: string;
}) {
  return Effect.gen(function* () {
    const accountId = input.project.source.accountId!;
    const externalProjectId = input.project.source.externalProjectId!;
    const identity = { provider: input.project.source.provider, accountId, externalProjectId };
    yield* ensureT3workContextCacheTables();
    yield* persistT3workContextBackgroundJobBestEffort(input.job, input.workspaceRoot, "running");
    while (input.job.queue.length > 0) {
      if (
        !(yield* shouldContinueT3workContextBackgroundRefresh(
          input.workspaceRoot,
          input.job.queue.length,
          input.job.rootKey,
        ))
      ) {
        yield* persistT3workContextBackgroundJobBestEffort(
          input.job,
          input.workspaceRoot,
          "pending",
        );
        return;
      }
      sortT3workContextBackgroundQueue(input.job);
      const item = input.job.queue.shift()!;
      if (
        item.depth > t3workContextBackgroundTargetDepth &&
        input.job.queue.some((candidate) => candidate.depth <= t3workContextBackgroundTargetDepth)
      ) {
        input.job.queue.push(item);
        continue;
      }
      const snapshot = yield* Effect.match(
        fetchSnapshot({
          provider: input.provider,
          key: item.resourceKey,
          externalProjectId,
        }),
        {
          onFailure: (left) => ({ _tag: "Left" as const, left }),
          onSuccess: (right) => ({ _tag: "Right" as const, right }),
        },
      );
      if (snapshot._tag === "Left") {
        yield* persistT3workContextBackgroundJobBestEffort(
          input.job,
          input.workspaceRoot,
          "running",
        );
        continue;
      }
      const key =
        normalizeT3workJiraKey(snapshot.right.ref.displayId ?? snapshot.right.ref.id) ??
        item.resourceKey;
      yield* upsertT3workContextResource({ identity, snapshot: snapshot.right });
      const edges = buildT3workContextBackgroundEdges({
        sourceKey: key,
        depth: item.depth,
        snapshot: snapshot.right,
      });
      yield* upsertT3workContextEdges({ identity, rootKey: input.job.rootKey, edges });
      const snapshotsByKey = new Map([[key, snapshot.right]]);
      const attachments = input.provider.downloadAsset
        ? yield* buildT3workContextAttachmentAssets({
            provider: input.provider as Required<Pick<AssetProvider, "downloadAsset">>,
            projectId: input.project.id,
            snapshotsByKey,
          })
        : { files: [], byTicketKey: new Map() };
      const bundle = buildT3workWorkItemContextBundle({
        projectId: input.project.id,
        rootKey: key,
        nodes: [
          {
            key,
            depth: item.depth,
            ticket: snapshotToT3workContextTicket({
              projectId: input.project.id,
              snapshot: snapshot.right,
            }),
            snapshot: snapshot.right,
            relationshipKeys: extractT3workJiraRelationshipKeys(snapshot.right.raw),
          },
        ],
        attachmentFiles: attachments.files,
        attachmentIndexes: attachments.byTicketKey,
      });
      yield* writeT3workWorkspaceContextFiles({
        workspaceRoot: input.workspaceRoot,
        files: bundle.files,
      });
      enqueueT3workContextBackgroundItems(
        input.job,
        edges.map((edge) => ({ key: edge.targetKey, depth: edge.depth })),
      );
      yield* logBackgroundItemProcessed({
        rootKey: input.job.rootKey,
        resourceKey: key,
        depth: item.depth,
        queueDepth: input.job.queue.length,
        includedCount: bundle.includedCount,
        skippedCount: bundle.skippedCount,
      });
      yield* persistT3workContextBackgroundJobBestEffort(input.job, input.workspaceRoot, "running");
    }
    yield* persistT3workContextBackgroundJobBestEffort(input.job, input.workspaceRoot, "completed");
    yield* logBackgroundCompleted({ rootKey: input.job.rootKey, jobId: input.job.jobId });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("t3work context background refresh failed", cause),
    ),
    Effect.ensuring(
      Effect.sync(() => {
        input.job.running = false;
      }),
    ),
  );
}
