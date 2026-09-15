import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import {
  readDigestBurndownBackfill,
  recordDigestBurndownBackfill,
} from "./t3team-myworkDigestBurndownBackfillCache.ts";

const identity = { provider: "atlassian", accountId: "acct-1", externalProjectId: "IES" };

const burndownLayer = it.layer(SqlitePersistenceMemory);

burndownLayer("t3team digest burndown backfill cache", (it) => {
  it.effect("reports not-ready until a backfill is recorded, then the stored rows", () =>
    Effect.gen(function* () {
      const before = yield* readDigestBurndownBackfill(identity, "s-2");
      assert.isTrue(before.ready === false);
      assert.equal(before.rows.length, 0);

      yield* recordDigestBurndownBackfill(identity, "s-2", [
        {
          issueId: "issue-1",
          issueKey: "IES-1",
          from: "To Do",
          to: "In Progress",
          atMs: 1_750_000_000_000,
        },
        {
          issueId: "issue-1",
          issueKey: "IES-1",
          from: "In Progress",
          to: "Done",
          atMs: 1_750_100_000_000,
        },
      ]);

      const after = yield* readDigestBurndownBackfill(identity, "s-2");
      assert.isTrue(after.ready === true);
      assert.equal(after.rows.length, 2);
      assert.equal(after.rows[0]?.to, "In Progress");
      assert.equal(after.rows[1]?.to, "Done");

      // A different sprint of the same project has its own (absent) marker.
      const other = yield* readDigestBurndownBackfill(identity, "s-3");
      assert.isTrue(other.ready === false);
    }),
  );

  it.effect("is idempotent: re-recording the same rows adds nothing", () =>
    Effect.gen(function* () {
      const entries = [
        { issueId: "issue-9", from: "To Do", to: "In Progress", atMs: 1_750_000_000_000 },
      ];
      yield* recordDigestBurndownBackfill(identity, "s-2", entries);
      yield* recordDigestBurndownBackfill(identity, "s-2", entries);
      const read = yield* readDigestBurndownBackfill(identity, "s-2");
      assert.equal(read.rows.filter((row) => row.issueId === "issue-9").length, 1);
    }),
  );
});
