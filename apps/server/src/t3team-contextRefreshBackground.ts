import type { ProjectShellProject } from "@t3tools/project-context";
import type { IntegrationProvider } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import {
  hydrateT3TeamContextBackgroundJob,
  persistT3TeamContextBackgroundJobBestEffort,
} from "./t3team-contextRefreshBackgroundPersist.ts";
import { runT3TeamContextBackgroundJob } from "./t3team-contextRefreshBackgroundRun.ts";
import {
  enqueueT3TeamContextBackgroundItems,
  getT3TeamContextBackgroundJob,
  t3teamContextBackgroundTargetDepth,
} from "./t3team-contextRefreshBackgroundQueue.ts";
import { logBackgroundKickoff } from "./t3team-contextRefreshTelemetry.ts";

type AssetProvider = IntegrationProvider & {
  readonly downloadAsset?: (
    url: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string }>;
};

export function kickT3TeamContextBackgroundExpansion(input: {
  readonly project: ProjectShellProject;
  readonly provider: AssetProvider;
  readonly workspaceRoot: string;
  readonly rootKey: string;
  readonly seeds: ReadonlyArray<{ readonly key: string; readonly depth: number }>;
}) {
  return Effect.gen(function* () {
    const hydrated = yield* hydrateT3TeamContextBackgroundJob({
      workspaceRoot: input.workspaceRoot,
      rootKey: input.rootKey,
    });
    const resumed = hydrated !== null;
    const job =
      hydrated ??
      getT3TeamContextBackgroundJob({
        workspaceRoot: input.workspaceRoot,
        rootKey: input.rootKey,
      });
    enqueueT3TeamContextBackgroundItems(job, input.seeds);
    yield* persistT3TeamContextBackgroundJobBestEffort(
      job,
      input.workspaceRoot,
      job.running ? "running" : "pending",
    );
    yield* logBackgroundKickoff({
      rootKey: input.rootKey,
      jobId: job.jobId,
      queueDepth: job.queue.length,
      seedCount: input.seeds.length,
      resumed,
    });
    return job;
  }).pipe(
    Effect.tap((job) =>
      job.running
        ? Effect.void
        : Effect.sync(() => {
            job.running = true;
          }).pipe(
            Effect.flatMap(() =>
              runT3TeamContextBackgroundJob({
                job,
                project: input.project,
                provider: input.provider,
                workspaceRoot: input.workspaceRoot,
              }),
            ),
            Effect.forkDetach,
          ),
    ),
    Effect.map((job) => ({
      jobId: job.jobId,
      targetDepth: t3teamContextBackgroundTargetDepth,
      queued: job.queue.length,
    })),
  );
}
