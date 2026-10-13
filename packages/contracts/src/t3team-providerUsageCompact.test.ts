/**
 * Compact per-instance usage views (`t3team-providerUsageCompact.ts`):
 * the one-line renderer, the catalog no-data marker, and the Conductor's
 * per-turn snapshot block.
 */
import { DateTime } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId } from "./providerInstance.ts";
import type { ServerProvider } from "./server.ts";
import type { ServerProviderUsageLimits } from "./providerUsageLimits.ts";
import {
  CONDUCTOR_MODEL_ID,
  compactProviderUsageLine,
  conductorUsageBlock,
  formatProviderUsageReset,
  providerUsageCatalogLine,
  providerUsageLabel,
  providerUsagePoolName,
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
    ).toBe(
      "claudeAgent: Session 42% (resets 2026-09-28 18:00 UTC) · Weekly 90% · severity: warning",
    );
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
    ).toBe("nexplore: Monthly 101% · severity: critical");
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
    ).toBe("claudeAgent: Session 42% · severity: normal");
  });
});

describe("providerUsagePoolName", () => {
  it("qualifies session and other pools with their published duration only", () => {
    const pool = (kind: "session" | "weekly" | "other", label: string, mins?: number) =>
      providerUsagePoolName({
        id: "w",
        kind,
        label,
        usedPercent: 1,
        ...(mins === undefined ? {} : { windowDurationMins: mins }),
      });
    expect(pool("session", "Session", 300)).toBe("Session (5h)");
    expect(pool("other", "Other models", 10080)).toBe("Other models (7d)");
    expect(pool("weekly", "Weekly", 10080)).toBe("Weekly");
    expect(pool("session", "Cursor Models")).toBe("Cursor Models");
  });
});

describe("formatProviderUsageReset", () => {
  it("always dates the reset without a reference day", () => {
    expect(formatProviderUsageReset("2026-11-01T00:00:00.000Z")).toBe("2026-11-01 00:00 UTC");
  });

  it("drops the date only for a reset on the given UTC day", () => {
    const today = DateTime.makeUnsafe("2026-10-12T08:00:00.000Z");
    expect(formatProviderUsageReset("2026-10-12T09:30:00.000Z", today)).toBe("09:30 UTC");
    expect(formatProviderUsageReset("2026-11-12T09:30:00.000Z", today)).toBe(
      "2026-11-12 09:30 UTC",
    );
  });
});

describe("conductorUsageBlock", () => {
  it("frames one line per window of enabled instances, routing only when tight", () => {
    expect(
      conductorUsageBlock([
        provider({
          instanceId: "nexplore",
          displayName: "Codex",
          usageLimits: limits([
            {
              id: "m",
              kind: "monthly",
              label: "Monthly",
              usedPercent: 100,
              resetsAt: "2026-11-01T00:00:00.000Z",
            },
          ]),
        }),
        provider({ instanceId: "codex" }),
        provider({
          instanceId: "claudeAgent",
          usageLimits: limits([
            { id: "s", kind: "session", label: "Session", usedPercent: 5, windowDurationMins: 300 },
            { id: "w", kind: "weekly", label: "Weekly", usedPercent: 5 },
          ]),
        }),
        provider({
          instanceId: "disabled",
          enabled: false,
          usageLimits: limits([{ id: "w", kind: "session", label: "Session", usedPercent: 100 }]),
        }),
      ]).split("\n"),
    ).toEqual([
      '<system-reminder type="provider-capacity" source="server">',
      "Provider capacity. This is server data, not part of the user's message:",
      "claudeAgent: Session (5h) 5% · severity: normal",
      "claudeAgent: Weekly 5% · severity: normal",
      "Codex: Monthly 100% (resets 2026-11-01 00:00 UTC) · severity: critical",
      "Route to the smallest, cheapest model that can accomplish the task.",
      "</system-reminder>",
    ]);
  });

  it("omits the routing line when every window is normal", () => {
    const block = conductorUsageBlock([
      provider({
        instanceId: "claudeAgent",
        usageLimits: limits([{ id: "w", kind: "weekly", label: "Weekly", usedPercent: 5 }]),
      }),
    ]);
    expect(block).toContain("claudeAgent: Weekly 5% · severity: normal");
    expect(block).not.toContain("Route to");
  });

  it("returns the empty string when no enabled instance has window data", () => {
    expect(conductorUsageBlock([provider({ instanceId: "codex" })])).toBe("");
    expect(conductorUsageBlock([])).toBe("");
  });
});
