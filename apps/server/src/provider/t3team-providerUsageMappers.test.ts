/**
 * Unit tests for the pure provider usage-limit mappers.
 *
 * The wire fixtures below are captured (in reduced form) from the real
 * Anthropic OAuth usage endpoint and the real Codex app-server
 * `account/rateLimits/read` response on this machine, so the mapping asserts
 * against what the providers actually return — percent + reset time are the
 * only usable numbers for subscription plans (dollar fields come back null).
 */
import { ProviderDriverKind } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { assert, describe, it } from "@effect/vitest";

import {
  CLAUDE_USAGE_SOURCE,
  CODX_USAGE_SOURCE,
  mapClaudeUsage,
  mapCodexRateLimits,
  type ClaudeUsageBody,
  type CodexRateLimitsBody,
} from "./t3team-providerUsageMappers.ts";
import {
  DEFAULT_PROVIDER_USAGE_THRESHOLDS,
  severityForPercent,
} from "./t3team-providerUsageSampler.ts";

const CLAUDE = ProviderDriverKind.make("claudeAgent");
const CODEX = ProviderDriverKind.make("codex");
const SAMPLED_AT = "2026-09-03T17:48:17.000Z";

const claudeUsageFixture: ClaudeUsageBody = {
  five_hour: {
    utilization: 100.0,
    resets_at: "2026-09-03T18:09:59.994384+00:00",
    limit_dollars: null,
    used_dollars: null,
    remaining_dollars: null,
    locked_reason: null,
  },
  seven_day: {
    utilization: 49.0,
    resets_at: "2026-09-07T00:59:59.994413+00:00",
    limit_dollars: null,
    used_dollars: null,
    remaining_dollars: null,
    locked_reason: null,
  },
  limits: [
    {
      kind: "session",
      group: "session",
      percent: 100,
      severity: "critical",
      resets_at: "2026-09-03T18:09:59.994384+00:00",
      scope: null,
      is_active: true,
    },
    {
      kind: "weekly_all",
      group: "weekly",
      percent: 49,
      severity: "normal",
      resets_at: "2026-09-07T00:59:59.994413+00:00",
      scope: null,
      is_active: false,
    },
  ],
};

const codexRateLimitsFixture: CodexRateLimitsBody = {
  rateLimits: {
    limitId: "codex",
    limitName: null,
    primary: { usedPercent: 97, windowDurationMins: 300, resetsAt: 1788459439 },
    secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1788765840 },
    credits: { hasCredits: false, unlimited: false, balance: null },
    individualLimit: null,
    spendControlReached: false,
    planType: "team",
    rateLimitReachedType: null,
  },
};

describe("severityForPercent", () => {
  it("applies the 80/100 default thresholds with critical winning", () => {
    assert.equal(severityForPercent(49), "normal");
    assert.equal(severityForPercent(80), "warning");
    assert.equal(severityForPercent(97), "warning");
    assert.equal(severityForPercent(100), "critical");
    assert.equal(severityForPercent(79, DEFAULT_PROVIDER_USAGE_THRESHOLDS), "normal");
  });
});

describe("mapClaudeUsage", () => {
  it("maps the five_hour/seven_day windows and prefers the API's own severity", () => {
    const report = mapClaudeUsage(claudeUsageFixture, {
      provider: CLAUDE,
      plan: "team",
      sampledAt: SAMPLED_AT,
    });
    assert.equal(report.provider, CLAUDE);
    assert.equal(report.plan, "team");
    assert.equal(report.windows.length, 2);
    const primary = report.windows[0]!;
    const secondary = report.windows[1]!;
    assert.equal(primary.window, "primary");
    assert.equal(primary.percentUsed, 100);
    assert.equal(primary.resetsAt, "2026-09-03T18:09:59.994384+00:00");
    assert.equal(primary.severity, "critical");
    assert.equal(primary.source, CLAUDE_USAGE_SOURCE);
    assert.equal(primary.sampledAt, SAMPLED_AT);
    assert.equal(secondary.window, "secondary");
    assert.equal(secondary.percentUsed, 49);
    assert.equal(secondary.severity, "normal");
  });

  it("falls back to host thresholds when limits[] lacks the window", () => {
    const report = mapClaudeUsage(
      { five_hour: { utilization: 82 }, seven_day: null },
      { provider: CLAUDE, sampledAt: SAMPLED_AT },
    );
    assert.equal(report.windows.length, 1);
    assert.equal(report.windows[0]!.severity, "warning");
    assert.equal(report.windows[0]!.resetsAt, null);
  });
});

describe("mapCodexRateLimits", () => {
  it("maps primary/secondary windows, plan type, and epoch reset times", () => {
    const report = mapCodexRateLimits(codexRateLimitsFixture, {
      provider: CODEX,
      sampledAt: SAMPLED_AT,
    });
    assert.equal(report.provider, CODEX);
    assert.equal(report.plan, "team");
    assert.equal(report.windows.length, 2);
    const primary = report.windows[0]!;
    const secondary = report.windows[1]!;
    assert.equal(primary.window, "primary");
    assert.equal(primary.percentUsed, 97);
    assert.equal(primary.severity, "warning");
    assert.equal(primary.resetsAt, DateTime.formatIso(DateTime.fromEpochSeconds(1788459439)));
    assert.equal(primary.source, CODX_USAGE_SOURCE);
    assert.equal(secondary.window, "secondary");
    assert.equal(secondary.percentUsed, 40);
    assert.equal(secondary.severity, "normal");
    assert.equal(secondary.resetsAt, DateTime.formatIso(DateTime.fromEpochSeconds(1788765840)));
  });

  it("marks an exhausted primary window critical", () => {
    const report = mapCodexRateLimits(
      { rateLimits: { primary: { usedPercent: 100, resetsAt: null } } },
      { provider: CODEX, sampledAt: SAMPLED_AT },
    );
    assert.equal(report.windows.length, 1);
    assert.equal(report.windows[0]!.severity, "critical");
    assert.equal(report.windows[0]!.resetsAt, null);
  });
});
