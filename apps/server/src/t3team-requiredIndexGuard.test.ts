import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "./persistence/Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import {
  assertRequiredIndexesLive,
  findMissingRequiredIndexes,
  MissingRequiredIndexError,
  REQUIRED_HOT_QUERY_INDEXES,
} from "./t3team-requiredIndexGuard.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

class AssertionFailure extends Error {
  override readonly name = "AssertionFailure" as const;

  constructor(message: string) {
    super(message);
  }
}

layer("t3team-requiredIndexGuard", (it) => {
  it("reports which declared indexes are missing", () => {
    assert.deepStrictEqual(findMissingRequiredIndexes(new Set([])), [
      REQUIRED_HOT_QUERY_INDEXES[0]!,
    ]);
    assert.deepStrictEqual(
      findMissingRequiredIndexes(
        new Set(REQUIRED_HOT_QUERY_INDEXES.map((index) => index.name)),
      ),
      [],
    );
  });

  it.effect("passes when the hot-query indexes are present", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      yield* assertRequiredIndexesLive();
    }),
  );

  it.effect("fails loudly when a required index is missing", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      // Simulate the ledger-collision state the guard exists for: migrations
      // all "ran" but the index was never actually created.
      yield* sql`DROP INDEX idx_projection_thread_activities_kind_created`;

      const outcome = yield* Effect.result(assertRequiredIndexesLive());
      if (!Result.isFailure(outcome)) {
        return yield* Effect.fail(
          new AssertionFailure("missing index must fail the assertion"),
        );
      }
      const error = outcome.failure;
      assert.isTrue(error instanceof MissingRequiredIndexError, "typed guard error expected");
      const guardError = error as MissingRequiredIndexError;
      assert.deepStrictEqual(guardError.missingIndexes, [
        "idx_projection_thread_activities_kind_created",
      ]);
      assert.match(guardError.message, /idx_projection_thread_activities_kind_created/);
    }),
  );
});
