import { describe, expect, it } from "vite-plus/test";

import {
  hasOtherActiveRun,
  isColdCompactionRouted,
  type ColdCompactionGateInput,
} from "./t3team-coldCompactionGate.ts";
import {
  COLD_NOW,
  COLD_REPORTED_AT,
  WARM_REPORTED_AT,
  compactionRun,
  isoAt,
  previousRun,
  route,
} from "./t3team-coldLocalCompaction.fixtures.ts";

const cold: ColdCompactionGateInput = {
  route,
  driver: "claudeAgent",
  usage: { usedTokens: 150_000, reportedAt: COLD_REPORTED_AT },
  nowMs: COLD_NOW,
  otherRunActive: false,
};

describe("isColdCompactionRouted", () => {
  it("routes a large thread idle past the route ttl", () => {
    expect(isColdCompactionRouted(cold)).toBe(true);
  });

  it("keeps a warm thread on the native compaction", () => {
    expect(
      isColdCompactionRouted({
        ...cold,
        usage: { usedTokens: 150_000, reportedAt: WARM_REPORTED_AT },
      }),
    ).toBe(false);
  });

  it("treats idle time exactly at the ttl as cold", () => {
    const reportedAt = isoAt(COLD_NOW - route.ttlMs);
    expect(isColdCompactionRouted({ ...cold, usage: { usedTokens: 150_000, reportedAt } })).toBe(
      true,
    );
    const justWarm = isoAt(COLD_NOW - route.ttlMs + 1);
    expect(
      isColdCompactionRouted({ ...cold, usage: { usedTokens: 150_000, reportedAt: justWarm } }),
    ).toBe(false);
  });

  it("keeps a context below the token threshold native, and routes it at the threshold", () => {
    const below = { usedTokens: route.minUsedTokens - 1, reportedAt: COLD_REPORTED_AT };
    expect(isColdCompactionRouted({ ...cold, usage: below })).toBe(false);
    expect(
      isColdCompactionRouted({ ...cold, usage: { ...below, usedTokens: route.minUsedTokens } }),
    ).toBe(true);
  });

  it("stays native while another run is active", () => {
    expect(isColdCompactionRouted({ ...cold, otherRunActive: true })).toBe(false);
  });

  it("stays native without a route, with a disabled route or for another driver", () => {
    expect(isColdCompactionRouted({ ...cold, route: undefined })).toBe(false);
    expect(isColdCompactionRouted({ ...cold, route: { ...route, enabled: false } })).toBe(false);
    expect(isColdCompactionRouted({ ...cold, driver: "codex" })).toBe(false);
  });

  it("stays native without a usage measurement or with an unreadable timestamp", () => {
    expect(isColdCompactionRouted({ ...cold, usage: undefined })).toBe(false);
    expect(
      isColdCompactionRouted({ ...cold, usage: { usedTokens: 150_000, reportedAt: "not a date" } }),
    ).toBe(false);
  });
});

describe("hasOtherActiveRun", () => {
  const withStatus = (status: typeof previousRun.status) => [{ ...previousRun, status }];

  it("ignores the compaction run itself and finished or queued runs", () => {
    expect(hasOtherActiveRun([compactionRun], compactionRun.id)).toBe(false);
    for (const status of ["completed", "failed", "interrupted", "cancelled", "queued"] as const) {
      expect(hasOtherActiveRun(withStatus(status), compactionRun.id)).toBe(false);
    }
  });

  it("counts a run that is preparing, starting, running or waiting", () => {
    for (const status of ["preparing", "starting", "running", "waiting"] as const) {
      expect(hasOtherActiveRun(withStatus(status), compactionRun.id)).toBe(true);
    }
  });
});
