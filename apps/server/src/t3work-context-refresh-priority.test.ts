import { describe, expect, it } from "vite-plus/test";

import {
  shouldPreemptT3workContextRefresh,
  sortT3workContextRefreshQueue,
} from "./t3work-context-refresh-priority.ts";

describe("t3work context refresh priority", () => {
  it("orders depth before all tie breakers", () => {
    const sorted = sortT3workContextRefreshQueue([
      { resourceKey: "P-4", depth: 4, enqueuedAt: 1, staleSince: 1 },
      { resourceKey: "P-2", depth: 2, enqueuedAt: 9 },
      { resourceKey: "P-3", depth: 3, enqueuedAt: 0, staleSince: 0 },
    ]);

    expect(sorted.map((item) => item.resourceKey)).toEqual(["P-2", "P-3", "P-4"]);
  });

  it("lets new shallow foreground work preempt deeper background work", () => {
    expect(
      shouldPreemptT3workContextRefresh({
        current: { resourceKey: "OLD-3", depth: 3, enqueuedAt: 1 },
        incoming: { resourceKey: "NEW-1", depth: 1, enqueuedAt: 10 },
      }),
    ).toBe(true);
  });
});
