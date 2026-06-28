// @effect-diagnostics nodeBuiltinImport:off - resume smoke uses temp workspace + SQLite.
import { assert, it } from "@effect/vitest";
import { buildJiraTicketEntryPoint } from "@t3tools/project-context/t3workContextPaths";
import * as Effect from "effect/Effect";

import { loadT3workContextRefreshJob } from "./t3work-context-refresh-jobs.ts";
import { T3workContextRefreshService } from "./t3work-contextRefreshService.ts";
import {
  makeContextRefreshIntegrationTestLayer,
  makeContextRefreshTestWorkspace,
  registerContextRefreshTestCleanup,
  seedContextRefreshIncompleteJob,
  writeContextRefreshTestJson,
} from "./t3work-contextRefreshTestFixtures.ts";

registerContextRefreshTestCleanup();

it.effect("resumes incomplete background jobs when the service starts", () =>
  Effect.gen(function* () {
    const { root, project } = makeContextRefreshTestWorkspace();
    const jobId = "job-resume-smoke";
    writeContextRefreshTestJson(root, buildJiraTicketEntryPoint(project.id, "ac-91"), {
      availability: "summary",
      key: "AC-91",
    });
    yield* seedContextRefreshIncompleteJob({
      workspaceRoot: root,
      rootKey: "AC-91",
      jobId,
      queue: [],
    });

    yield* T3workContextRefreshService;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const job = yield* loadT3workContextRefreshJob(jobId);
      if (job?.status === "completed") {
        return;
      }
      yield* Effect.yieldNow;
    }

    const finalJob = yield* loadT3workContextRefreshJob(jobId);
    assert.strictEqual(finalJob?.status, "completed");
  }).pipe(Effect.provide(makeContextRefreshIntegrationTestLayer("t3work-context-refresh-resume-"))),
);
