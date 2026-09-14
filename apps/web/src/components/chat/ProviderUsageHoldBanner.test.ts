import { describe, expect, it } from "vite-plus/test";

import { deriveProviderUsageHoldBanner } from "./t3team-ProviderUsageHoldBanner.tsx";

const started = (createdAt: string, payload: Record<string, unknown>) => ({
  kind: "provider.usage-hold.started",
  createdAt,
  payload,
});

describe("deriveProviderUsageHoldBanner", () => {
  it("preserves a disabled auto-resume choice across refresh activities", () => {
    const state = deriveProviderUsageHoldBanner([
      started("2026-09-07T12:00:00.000Z", {
        driver: "codex",
        resetsAt: "2026-09-07T13:00:00.000Z",
        autoResume: true,
      }),
      {
        kind: "provider.usage-hold.auto-resume-set",
        createdAt: "2026-09-07T12:01:00.000Z",
        payload: { autoResume: false },
      },
      started("2026-09-07T12:02:00.000Z", {
        driver: "codex",
        resetsAt: "2026-09-07T14:00:00.000Z",
      }),
    ]);

    expect(state).toMatchObject({
      driver: "codex",
      resetsAt: "2026-09-07T14:00:00.000Z",
      autoResume: false,
    });
  });
});
