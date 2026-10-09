import { assert, describe, it } from "@effect/vitest";

import {
  KANBAN_SEMANTIC_ZOOM_FLAG_ENV,
  isKanbanSemanticZoomEnabled,
} from "./t3team-kanbanZoomFlag.ts";

describe("isKanbanSemanticZoomEnabled", () => {
  const readEnv = (value: string | undefined) => (key: string) =>
    key === KANBAN_SEMANTIC_ZOOM_FLAG_ENV ? value : undefined;

  it("defaults off when the env is unset", () => {
    assert.isFalse(isKanbanSemanticZoomEnabled(readEnv(undefined)));
  });

  it("is on for 1/true/on (case-insensitive, trimmed)", () => {
    for (const value of ["1", "true", "on", "TRUE", " On "]) {
      assert.isTrue(isKanbanSemanticZoomEnabled(readEnv(value)), value);
    }
  });

  it("is off for 0/false/off/empty/garbage", () => {
    for (const value of ["0", "false", "off", "", "yes", "2"]) {
      assert.isFalse(isKanbanSemanticZoomEnabled(readEnv(value)), value);
    }
  });
});
