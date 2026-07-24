// @effect-diagnostics nodeBuiltinImport:off - resume smoke uses temp workspace + SQLite.
import { assert, it } from "@effect/vitest";
import { buildJiraTicketEntryPoint } from "@t3tools/project-context/t3teamContextPaths";
import * as Effect from "effect/Effect";

import { loadT3TeamContextRefreshJob } from "./t3team-context-refresh-jobs.ts";
import { T3TeamContextRefreshService } from "./t3team-contextRefreshService.ts";
import {
  makeContextRefreshIntegrationTestLayer,
  makeContextRefreshTestWorkspace,
  registerContextRefreshTestCleanup,
  seedContextRefreshIncompleteJob,
  writeContextRefreshTestJson,
} from "./t3team-contextRefreshTestFixtures.ts";

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

    yield* T3TeamContextRefreshService;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const job = yield* loadT3TeamContextRefreshJob(jobId);
      if (job?.status === "completed") {
        return;
      }
      yield* Effect.yieldNow;
    }

    const finalJob = yield* loadT3TeamContextRefreshJob(jobId);
    assert.strictEqual(finalJob?.status, "completed");
  }).pipe(Effect.provide(makeContextRefreshIntegrationTestLayer("t3team-context-refresh-resume-"))),
);
