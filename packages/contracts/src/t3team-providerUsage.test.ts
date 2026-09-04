/**
 * Decode/encode checks for the provider usage-limit contract
 * (`t3team-providerUsage.ts`).
 */
import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import {
  PROVIDER_USAGE_CONTRACT_VERSION,
  ProviderUsageQueryResult,
  ProviderUsageReport,
  ProviderUsageSample,
  ProviderUsageSeverity,
} from "./t3team-providerUsage.ts";

const CLAUDE = ProviderDriverKind.make("claudeAgent");

const sample: ProviderUsageSample = {
  provider: CLAUDE,
  window: "primary",
  percentUsed: 97,
  resetsAt: "2026-09-03T18:09:59.994Z",
  severity: "warning",
  source: "anthropic-oauth-usage",
  sampledAt: "2026-09-03T17:48:17.000Z",
};

describe("ProviderUsageSample", () => {
  it("round-trips a well-formed sample", () => {
    const decoded = Schema.decodeUnknownSync(ProviderUsageSample)(sample);
    expect(decoded).toEqual(sample);
    expect(Schema.encodeSync(ProviderUsageSample)(decoded)).toEqual(sample);
  });

  it("rejects out-of-range percentages", () => {
    expect(
      Exit.isFailure(
        Schema.decodeUnknownExit(ProviderUsageSample)({ ...sample, percentUsed: 101 }),
      ),
    ).toBe(true);
    expect(
      Exit.isFailure(Schema.decodeUnknownExit(ProviderUsageSample)({ ...sample, percentUsed: -1 })),
    ).toBe(true);
  });

  it("accepts a null resetsAt and validates the severity set", () => {
    const decoded = Schema.decodeUnknownSync(ProviderUsageSample)({ ...sample, resetsAt: null });
    expect(decoded.resetsAt).toBeNull();
    expect(
      Exit.isFailure(Schema.decodeUnknownExit(ProviderUsageSeverity)({ severity: "bogus" })),
    ).toBe(true);
    expect(Exit.isSuccess(Schema.decodeUnknownExit(ProviderUsageSeverity)("critical"))).toBe(true);
  });
});

describe("ProviderUsageQueryResult", () => {
  it("round-trips the full tool answer shape", () => {
    const report: ProviderUsageReport = {
      provider: CLAUDE,
      plan: "team",
      windows: [sample],
    };
    const payload = {
      contractVersion: PROVIDER_USAGE_CONTRACT_VERSION,
      reports: [report],
      unavailable: [{ provider: CLAUDE, reason: "codex not installed" }],
    };
    const decoded = Schema.decodeUnknownSync(ProviderUsageQueryResult)(payload);
    expect(decoded).toEqual(payload);
    expect(Schema.encodeSync(ProviderUsageQueryResult)(decoded)).toEqual(payload);
  });
});
