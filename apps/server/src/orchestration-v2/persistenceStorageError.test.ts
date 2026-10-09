import { assert, describe, it } from "@effect/vitest";

import {
  PERSISTENCE_STORAGE_EXHAUSTED_MESSAGE,
  describePersistenceStorageExhausted,
  isPersistenceStorageExhausted,
  rewritePersistenceFailureCause,
} from "./persistenceStorageError.ts";

describe("persistenceStorageError", () => {
  it("detects raw SQLITE_CANTOPEN wording from a full disk", () => {
    assert.isTrue(isPersistenceStorageExhausted("unable to open database file"));
    assert.isTrue(isPersistenceStorageExhausted(new Error("Error: unable to open database file")));
    assert.isTrue(isPersistenceStorageExhausted(new Error("SQLITE_CANTOPEN: open failed")));
    assert.isTrue(isPersistenceStorageExhausted(new Error("ENOSPC: no space left on device")));
    assert.isTrue(isPersistenceStorageExhausted(new Error("database or disk is full")));
  });

  it("does not treat ordinary sqlite busy or missing-table errors as storage exhaustion", () => {
    assert.isFalse(isPersistenceStorageExhausted("database is locked"));
    assert.isFalse(isPersistenceStorageExhausted("no such table: orchestration_v2_events"));
    assert.isFalse(isPersistenceStorageExhausted(undefined));
  });

  it("rewrites the defect so Stop surfaces an actionable message", () => {
    assert.equal(
      describePersistenceStorageExhausted("unable to open database file"),
      PERSISTENCE_STORAGE_EXHAUSTED_MESSAGE,
    );
    assert.equal(
      rewritePersistenceFailureCause("unable to open database file"),
      PERSISTENCE_STORAGE_EXHAUSTED_MESSAGE,
    );
    assert.equal(rewritePersistenceFailureCause("database is locked"), "database is locked");
  });
});
