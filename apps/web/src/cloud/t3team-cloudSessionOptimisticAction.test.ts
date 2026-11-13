import { describe, expect, it } from "vite-plus/test";

import { optimisticActionLabel } from "./t3team-cloudSessionOptimisticLabel";

describe("optimisticActionLabel", () => {
  it("shows the pending wording immediately after a click", () => {
    expect(optimisticActionLabel(false, "Retry", "Retrying…")).toBe("Retry");
    expect(optimisticActionLabel(true, "Retry", "Retrying…")).toBe("Retrying…");
    expect(optimisticActionLabel(true, "Try again", "Starting…")).toBe("Starting…");
    expect(optimisticActionLabel(true, "Start another cloud session", "Starting…")).toBe(
      "Starting…",
    );
  });
});
