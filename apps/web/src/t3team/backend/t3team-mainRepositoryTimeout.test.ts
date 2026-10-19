import { describe, expect, it } from "vite-plus/test";

import { MAIN_REPOSITORY_SWITCH_TIMEOUT_MS } from "./t3team-t3BackendApis";

describe("main repository switch timeout", () => {
  it("allows far longer than the 15s default, so a large state-dir copy is not aborted", () => {
    expect(MAIN_REPOSITORY_SWITCH_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
  });
});
