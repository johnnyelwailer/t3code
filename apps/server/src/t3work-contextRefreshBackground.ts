import type { ProjectShellProject } from "@t3tools/project-context";
import type { IntegrationProvider } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import {
  hydrateT3workContextBackgroundJob,
  persistT3workContextBackgroundJobBestEffort,
} from "./t3work-contextRefreshBackgroundPersist.ts";
import { runT3workContextBackgroundJob } from "./t3work-contextRefreshBackgroundRun.ts";
import {
  enqueueT3workContextBackgroundItems,
  getT3workContextBackgroundJob,
  t3workContextBackgroundTargetDepth,
} from "./t3work-contextRefreshBackgroundQueue.ts";
import { logBackgroundKickoff } from "./t3work-contextRefreshTelemetry.ts";

type AssetProvider = IntegrationProvider & {
  readonly downloadAsset?: (
    url: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string }>;
};

export function kickT3workContextBackgroundExpansion(input: {
  readonly project: ProjectShellProject;
  readonly provider: AssetProvider;
  readonly workspaceRoot: string;
  readonly rootKey: string;
  readonly seeds: ReadonlyArray<{ readonly key: string; readonly depth: number }>;
}) {
  return Effect.gen(function* () {
    const hydrated = yield* hydrateT3workContextBackgroundJob({
      workspaceRoot: input.workspaceRoot,
      rootKey: input.rootKey,
    });
    const resumed = hydrated !== null;
    const job =
      hydrated ??
      getT3workContextBackgroundJob({
        workspaceRoot: input.workspaceRoot,
        rootKey: input.rootKey,
      });
    enqueueT3workContextBackgroundItems(job, input.seeds);
    yield* persistT3workContextBackgroundJobBestEffort(
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
              runT3workContextBackgroundJob({
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
      targetDepth: t3workContextBackgroundTargetDepth,
      queued: job.queue.length,
    })),
  );
}
