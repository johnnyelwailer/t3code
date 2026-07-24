import type { ProjectShellProject } from "@t3tools/project-context";
import type { IntegrationProvider } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import {
  ensureT3TeamContextCacheTables,
  upsertT3TeamContextEdges,
  upsertT3TeamContextResource,
} from "./t3team-context-cache-tables.ts";
import { buildT3TeamContextAttachmentAssets } from "./t3team-context-attachment-assets.ts";
import { buildT3TeamWorkItemContextBundle } from "./t3team-context-bundle-builder.ts";
import { shouldContinueT3TeamContextBackgroundRefresh } from "./t3team-contextRefreshBackgroundBudget.ts";
import { buildT3TeamContextBackgroundEdges } from "./t3team-contextRefreshBackgroundEdges.ts";
import { persistT3TeamContextBackgroundJobBestEffort } from "./t3team-contextRefreshBackgroundPersist.ts";
import {
  enqueueT3TeamContextBackgroundItems,
  releaseT3TeamContextBackgroundJobIfIdle,
  sortT3TeamContextBackgroundQueue,
  t3teamContextBackgroundTargetDepth,
  type T3TeamContextBackgroundJob,
} from "./t3team-contextRefreshBackgroundQueue.ts";
import {
  extractT3TeamJiraRelationshipKeys,
  normalizeT3TeamJiraKey,
} from "./t3team-context-jira-relationships.ts";
import { snapshotToT3TeamContextTicket } from "./t3team-context-ticket.ts";
import {
  logBackgroundCompleted,
  logBackgroundItemProcessed,
} from "./t3team-contextRefreshTelemetry.ts";
import { writeT3TeamWorkspaceContextFiles } from "./t3team-project-workspace-context-files.ts";

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

export function runT3TeamContextBackgroundJob(input: {
  readonly job: T3TeamContextBackgroundJob;
  readonly project: ProjectShellProject;
  readonly provider: AssetProvider;
  readonly workspaceRoot: string;
}) {
  return Effect.gen(function* () {
    const accountId = input.project.source.accountId!;
    const externalProjectId = input.project.source.externalProjectId!;
    const identity = { provider: input.project.source.provider, accountId, externalProjectId };
    yield* ensureT3TeamContextCacheTables();
    yield* persistT3TeamContextBackgroundJobBestEffort(input.job, input.workspaceRoot, "running");
    while (input.job.queue.length > 0) {
      if (
        !(yield* shouldContinueT3TeamContextBackgroundRefresh(
          input.workspaceRoot,
          input.job.queue.length,
          input.job.rootKey,
        ))
      ) {
        yield* persistT3TeamContextBackgroundJobBestEffort(
          input.job,
          input.workspaceRoot,
          "pending",
        );
        return;
      }
      sortT3TeamContextBackgroundQueue(input.job);
      const item = input.job.queue.shift()!;
      if (
        item.depth > t3teamContextBackgroundTargetDepth &&
        input.job.queue.some((candidate) => candidate.depth <= t3teamContextBackgroundTargetDepth)
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
        yield* persistT3TeamContextBackgroundJobBestEffort(
          input.job,
          input.workspaceRoot,
          "running",
        );
        continue;
      }
      const key =
        normalizeT3TeamJiraKey(snapshot.right.ref.displayId ?? snapshot.right.ref.id) ??
        item.resourceKey;
      yield* upsertT3TeamContextResource({ identity, snapshot: snapshot.right });
      const edges = buildT3TeamContextBackgroundEdges({
        sourceKey: key,
        depth: item.depth,
        snapshot: snapshot.right,
      });
      yield* upsertT3TeamContextEdges({ identity, rootKey: input.job.rootKey, edges });
      const snapshotsByKey = new Map([[key, snapshot.right]]);
      const attachments = input.provider.downloadAsset
        ? yield* buildT3TeamContextAttachmentAssets({
            provider: input.provider as Required<Pick<AssetProvider, "downloadAsset">>,
            projectId: input.project.id,
            snapshotsByKey,
          })
        : { files: [], byTicketKey: new Map() };
      const bundle = buildT3TeamWorkItemContextBundle({
        projectId: input.project.id,
        rootKey: key,
        nodes: [
          {
            key,
            depth: item.depth,
            ticket: snapshotToT3TeamContextTicket({
              projectId: input.project.id,
              snapshot: snapshot.right,
            }),
            snapshot: snapshot.right,
            relationshipKeys: extractT3TeamJiraRelationshipKeys(snapshot.right.raw),
          },
        ],
        attachmentFiles: attachments.files,
        attachmentIndexes: attachments.byTicketKey,
      });
      yield* writeT3TeamWorkspaceContextFiles({
        workspaceRoot: input.workspaceRoot,
        files: bundle.files,
      });
      enqueueT3TeamContextBackgroundItems(
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
      yield* persistT3TeamContextBackgroundJobBestEffort(input.job, input.workspaceRoot, "running");
    }
    yield* persistT3TeamContextBackgroundJobBestEffort(input.job, input.workspaceRoot, "completed");
    yield* logBackgroundCompleted({ rootKey: input.job.rootKey, jobId: input.job.jobId });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("t3team context background refresh failed", cause),
    ),
    Effect.ensuring(
      Effect.sync(() => {
        input.job.running = false;
        releaseT3TeamContextBackgroundJobIfIdle(
          { workspaceRoot: input.workspaceRoot, rootKey: input.job.rootKey },
          input.job,
        );
      }),
    ),
  );
}
