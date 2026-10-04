/**
 * Severity rule and tool-answer shape of the provider usage view
 * (`t3team-providerUsage.ts`).
 */
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";
import type { ServerProviderUsageLimits } from "./providerUsageLimits.ts";
import {
  PROVIDER_USAGE_CONTRACT_VERSION,
  ProviderUsageQueryResult,
  exhaustedUsageWindows,
  providerUsageSeverity,
  sessionUsageWindow,
} from "./t3team-providerUsage.ts";

const decodeResult = Schema.decodeSync(ProviderUsageQueryResult);
const encodeResult = Schema.encodeSync(ProviderUsageQueryResult);

const limits = (windows: ServerProviderUsageLimits["windows"]): ServerProviderUsageLimits => ({
  checkedAt: "2026-09-28T10:00:00.000Z",
  windows,
});

describe("providerUsageSeverity", () => {
  it("maps used percent onto the 80/100 thresholds", () => {
    expect(providerUsageSeverity(79.9)).toBe("normal");
    expect(providerUsageSeverity(80)).toBe("warning");
    expect(providerUsageSeverity(99.9)).toBe("warning");
    expect(providerUsageSeverity(100)).toBe("critical");
  });
});

describe("sessionUsageWindow", () => {
  it("prefers the session kind", () => {
    const window = sessionUsageWindow(
      limits([
        { id: "seven_day", kind: "weekly", label: "Weekly", usedPercent: 10 },
        { id: "five_hour", kind: "session", label: "Session", usedPercent: 50 },
      ]),
    );
    expect(window?.id).toBe("five_hour");
  });

  it("falls back to the shortest window duration", () => {
    const window = sessionUsageWindow(
      limits([
        { id: "a", kind: "other", label: "A", usedPercent: 1, windowDurationMins: 10_080 },
        { id: "b", kind: "other", label: "B", usedPercent: 2, windowDurationMins: 300 },
      ]),
    );
    expect(window?.id).toBe("b");
  });

  it("treats unavailable or empty limits as no data", () => {
    expect(sessionUsageWindow(undefined)).toBeNull();
    expect(sessionUsageWindow(limits([]))).toBeNull();
    expect(
      sessionUsageWindow({
        ...limits([{ id: "five_hour", kind: "session", label: "Session", usedPercent: 100 }]),
        unavailable: { reason: "probeFailed" },
      }),
    ).toBeNull();
    expect(
      exhaustedUsageWindows({
        ...limits([{ id: "five_hour", kind: "session", label: "Session", usedPercent: 100 }]),
        unavailable: { reason: "probeFailed" },
      }),
    ).toEqual([]);
  });
});

describe("ProviderUsageQueryResult", () => {
  it("round-trips the tool answer shape", () => {
    const payload = {
      contractVersion: PROVIDER_USAGE_CONTRACT_VERSION,
      instances: [
        {
          providerInstanceId: ProviderInstanceId.make("claude_work"),
          driver: ProviderDriverKind.make("claudeAgent"),
          checkedAt: "2026-09-28T10:00:00.000Z",
          sessionSeverity: "warning" as const,
          windows: [
            {
              id: "five_hour",
              kind: "session" as const,
              label: "Session",
              usedPercent: 85,
              resetsAt: "2026-09-28T12:00:00.000Z",
              severity: "warning" as const,
            },
          ],
        },
      ],
      hubAccounts: [],
      hubErrors: [],
    };
    expect(encodeResult(decodeResult(payload))).toEqual(payload);
  });
});
