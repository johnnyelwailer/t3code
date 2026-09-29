import { describe, expect, it } from "vite-plus/test";

import {
  deriveProviderUsageHoldBanner,
  deriveProviderUsageWarningBanner,
  describeHoldReset,
} from "./t3team-ProviderUsageHoldBanner.tsx";

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

describe("describeHoldReset", () => {
  const now = Date.parse("2026-09-28T10:00:00.000Z");

  it("phrases the reset like the Limits view", () => {
    expect(describeHoldReset("2026-09-28T12:13:00.000Z", now)).toBe("resets in 2h 13m");
    expect(describeHoldReset("2026-09-28T10:00:30.000Z", now)).toBe("resets shortly");
    expect(describeHoldReset("2026-09-28T09:00:00.000Z", now)).toBe("resuming…");
  });
});

describe("deriveProviderUsageWarningBanner", () => {
  it("shows the latest warning until a hold or a clear supersedes it", () => {
    const warning = {
      kind: "provider.usage.warning",
      createdAt: "2026-09-28T10:00:00.000Z",
      payload: { providerInstanceId: "claude_work", percentUsed: 85, resetsAt: null },
    };
    expect(deriveProviderUsageWarningBanner([warning])?.percentUsed).toBe(85);
    expect(
      deriveProviderUsageWarningBanner([
        warning,
        started("2026-09-28T10:01:00.000Z", { resetsAt: "2026-09-28T11:00:00.000Z" }),
      ]),
    ).toBeNull();
  });
});
