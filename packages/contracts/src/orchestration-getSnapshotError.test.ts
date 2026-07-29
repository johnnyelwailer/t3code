import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { OrchestrationGetSnapshotError } from "./orchestration.ts";

// New sibling test file (rather than extending orchestration.test.ts) so this
// change stays additive: orchestration.test.ts is an upstream-tracked file
// and the additive guard whitelist for this change intentionally only adds
// packages/client-runtime/src/state/threads.ts.
const decodeOrchestrationGetSnapshotError = Schema.decodeUnknownEffect(
  OrchestrationGetSnapshotError,
);

it.effect(
  "OrchestrationGetSnapshotError decodes old-shape payloads without `reason` (skew safety)",
  () =>
    Effect.gen(function* () {
      const parsed = yield* decodeOrchestrationGetSnapshotError({
        _tag: "OrchestrationGetSnapshotError",
        message: "boom",
      });
      assert.strictEqual(parsed.message, "boom");
      assert.strictEqual(parsed.reason, undefined);
    }),
);

it.effect("OrchestrationGetSnapshotError decodes new-shape payloads with reason: not-found", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeOrchestrationGetSnapshotError({
      _tag: "OrchestrationGetSnapshotError",
      message: "Thread thread-1 was not found",
      reason: "not-found",
    });
    assert.strictEqual(parsed.reason, "not-found");
  }),
);
