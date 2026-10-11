/**
 * Compact per-instance usage views (`t3team-providerUsageCompact.ts`):
 * the one-line renderer, the catalog no-data marker, and the Conductor's
 * per-turn snapshot block.
 */
import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId } from "./providerInstance.ts";
import type { ServerProvider } from "./server.ts";
import type { ServerProviderUsageLimits } from "./providerUsageLimits.ts";
import {
  CONDUCTOR_MODEL_ID,
  compactProviderUsageLine,
  conductorUsageBlock,
  providerUsageCatalogLine,
  providerUsageLabel,
  worstProviderUsageSeverity,
} from "./t3team-providerUsageCompact.ts";

const provider = (input: {
  readonly instanceId: string;
  readonly displayName?: string;
  readonly enabled?: boolean;
  readonly usageLimits?: ServerProviderUsageLimits;
}): ServerProvider =>
  ({
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: "claudeAgent",
    enabled: input.enabled ?? true,
    installed: true,
    version: "test",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-09-28T10:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
    ...(input.usageLimits === undefined ? {} : { usageLimits: input.usageLimits }),
  }) as unknown as ServerProvider;

const limits = (windows: ServerProviderUsageLimits["windows"]): ServerProviderUsageLimits => ({
  checkedAt: "2026-09-28T10:00:00.000Z",
  windows,
});

describe("CONDUCTOR_MODEL_ID", () => {
  it("is the named conductor model id", () => {
    expect(CONDUCTOR_MODEL_ID).toBe("conductor");
  });
});

describe("worstProviderUsageSeverity", () => {
  it("picks the most alarming window", () => {
    expect(
      worstProviderUsageSeverity([
        { id: "a", kind: "session", label: "Session", usedPercent: 10 },
        { id: "b", kind: "weekly", label: "Weekly", usedPercent: 90 },
      ]),
    ).toBe("warning");
    expect(
      worstProviderUsageSeverity([
        { id: "a", kind: "session", label: "Session", usedPercent: 100 },
        { id: "b", kind: "weekly", label: "Weekly", usedPercent: 10 },
      ]),
    ).toBe("critical");
    expect(
      worstProviderUsageSeverity([{ id: "a", kind: "session", label: "Session", usedPercent: 40 }]),
    ).toBe("normal");
  });
});

describe("providerUsageLabel", () => {
  it("prefers the display name and falls back to the id", () => {
    expect(providerUsageLabel(provider({ instanceId: "claudeAgent" }))).toBe("claudeAgent");
    expect(
      providerUsageLabel(provider({ instanceId: "claudeAgent", displayName: "Claude (work)" })),
    ).toBe("Claude (work)");
    expect(providerUsageLabel(provider({ instanceId: "claudeAgent", displayName: "  " }))).toBe(
      "claudeAgent",
    );
  });
});

describe("compactProviderUsageLine", () => {
  it("renders every window with its reset and the instance's worst severity", () => {
    expect(
      compactProviderUsageLine(
        "claudeAgent",
        limits([
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            usedPercent: 42,
            resetsAt: "2026-09-28T18:00:00.000Z",
          },
          { id: "seven_day", kind: "weekly", label: "Weekly", usedPercent: 90 },
        ]),
      ),
    ).toBe("claudeAgent: session 42% (resets 18:00Z) · weekly 90% · severity: warning");
  });

  it("returns null when there is no window data", () => {
    expect(compactProviderUsageLine("codex", undefined)).toBeNull();
    expect(compactProviderUsageLine("codex", limits([]))).toBeNull();
    expect(
      compactProviderUsageLine("codex", {
        ...limits([{ id: "w", kind: "session", label: "Session", usedPercent: 10 }]),
        unavailable: { reason: "probeFailed" },
      }),
    ).toBeNull();
  });

  it("omits the reset when a window has none", () => {
    expect(
      compactProviderUsageLine(
        "nexplore",
        limits([{ id: "m", kind: "monthly", label: "Monthly", usedPercent: 101 }]),
      ),
    ).toBe("nexplore: monthly 101% · severity: critical");
  });
});

describe("providerUsageCatalogLine", () => {
  it("always returns a string, with an explicit no-data marker", () => {
    expect(providerUsageCatalogLine(provider({ instanceId: "codex", displayName: "Codex" }))).toBe(
      "Codex: no usage data",
    );
    expect(
      providerUsageCatalogLine(
        provider({
          instanceId: "claudeAgent",
          usageLimits: limits([{ id: "w", kind: "session", label: "Session", usedPercent: 42 }]),
        }),
      ),
    ).toBe("claudeAgent: session 42% · severity: normal");
  });
});

describe("conductorUsageBlock", () => {
  it("lists enabled instances with data, ordered by instance id, and omits the rest", () => {
    expect(
      conductorUsageBlock([
        provider({
          instanceId: "nexplore",
          usageLimits: limits([{ id: "w", kind: "session", label: "Session", usedPercent: 90 }]),
        }),
        provider({ instanceId: "codex" }),
        provider({
          instanceId: "claudeAgent",
          usageLimits: limits([{ id: "w", kind: "weekly", label: "Weekly", usedPercent: 5 }]),
        }),
        provider({
          instanceId: "disabled",
          enabled: false,
          usageLimits: limits([{ id: "w", kind: "session", label: "Session", usedPercent: 100 }]),
        }),
      ]),
    ).toBe("claudeAgent: weekly 5% · severity: normal\nnexplore: session 90% · severity: warning");
  });

  it("returns the empty string when no enabled instance has window data", () => {
    expect(conductorUsageBlock([provider({ instanceId: "codex" })])).toBe("");
    expect(conductorUsageBlock([])).toBe("");
  });
});
