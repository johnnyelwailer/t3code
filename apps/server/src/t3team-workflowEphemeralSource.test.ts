import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  ensureEphemeralRunsGitignore,
  replaceEphemeralWorkflowSourceAtomically,
  resolveEphemeralWorkflowSourcePath,
  writeEphemeralWorkflowRepairAudit,
} from "./t3team-workflowEphemeralSource.ts";

describe("ephemeral workflow source replacement", () => {
  it.effect("rejects traversal run ids", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolveEphemeralWorkflowSourcePath({ runsRoot: "/tmp/runs", runId: "../outside" }),
      );
      assert.strictEqual(error.message, "Invalid ephemeral workflow run id.");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("replaces only the run workflow and preserves the original audit copy", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const runsRoot = yield* fs.makeTempDirectoryScoped({ prefix: "t3team-repair-" });
        const target = path.join(runsRoot, "run-1", "workflow.ts");
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(target, "original");
        const outcome = yield* replaceEphemeralWorkflowSourceAtomically({
          runsRoot,
          runId: "run-1",
          source: "replacement",
        });
        assert.strictEqual(outcome.target, target);
        assert.strictEqual(yield* fs.readFileString(target), "replacement");
        assert.strictEqual(yield* fs.readFileString(outcome.auditPath), "original");
        yield* replaceEphemeralWorkflowSourceAtomically({
          runsRoot,
          runId: "run-1",
          source: "replacement-2",
        });
        assert.strictEqual(yield* fs.readFileString(outcome.auditPath), "original");
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect("writes a structured repair audit without repair child ids", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const runsRoot = yield* fs.makeTempDirectoryScoped({ prefix: "t3team-repair-" });
        const target = path.join(runsRoot, "run-1", "workflow.ts");
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(target, "original");
        const auditPath = yield* writeEphemeralWorkflowRepairAudit({
          runsRoot,
          runId: "run-1",
          attempt: 1,
          timestamp: "2026-07-19T00:00:00.000Z",
          originalError: "SyntaxError: bad token",
          outcome: "recovered",
          summary: "removed throw",
        });
        const text = yield* fs.readFileString(auditPath);
        assert.strictEqual(text.includes("recovered"), true);
        assert.strictEqual(text.includes("SyntaxError: bad token"), true);
        assert.strictEqual(text.includes("repair:1"), false);
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect("creates a self-ignoring .gitignore under a fresh runs root", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const runsRoot = yield* fs.makeTempDirectoryScoped({ prefix: "t3team-runs-gitignore-" });
        const gitignorePath = path.join(runsRoot, ".gitignore");
        assert.strictEqual(yield* fs.exists(gitignorePath), false);

        yield* ensureEphemeralRunsGitignore({ runsRoot });

        assert.strictEqual(yield* fs.exists(gitignorePath), true);
        assert.strictEqual(yield* fs.readFileString(gitignorePath), "*\n");
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );

  it.effect("leaves an existing .gitignore untouched", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const runsRoot = yield* fs.makeTempDirectoryScoped({ prefix: "t3team-runs-gitignore-" });
        const gitignorePath = path.join(runsRoot, ".gitignore");
        yield* fs.writeFileString(gitignorePath, "custom-entry\n");

        yield* ensureEphemeralRunsGitignore({ runsRoot });

        assert.strictEqual(yield* fs.readFileString(gitignorePath), "custom-entry\n");
      }).pipe(Effect.provide(NodeServices.layer)),
    ),
  );
});
