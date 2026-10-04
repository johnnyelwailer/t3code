import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { CloudSessionListResultSchema, CloudSessionSchema } from "./t3team-cloudSession.ts";

const decode = Schema.decodeUnknownSync(CloudSessionSchema);

/** A record shaped exactly as an older server (pre env-id / duration) emits it. */
const LEGACY_SESSION = {
  sessionId: "248523362",
  providerKind: "github_actions",
  phase: "ready",
  elapsedSeconds: 154,
  remainingSeconds: null,
  machineLabel: "ubuntu-slim · 12 GB · 4 cores",
  failureReason: null,
  detailsUrl: "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/248523362",
} as const;

describe("CloudSessionSchema", () => {
  it("still parses a record from a server that predates the new fields", () => {
    // The whole point of making `environmentId`/`durationSeconds` optional: an
    // old server omits them and the client must not reject the record.
    const decoded = decode(LEGACY_SESSION);
    expect(decoded.environmentId).toBeUndefined();
    expect(decoded.durationSeconds).toBeUndefined();
    expect(decoded.phase).toBe("ready");
  });

  it("carries the relay environment id when the server supplies it", () => {
    const decoded = decode({ ...LEGACY_SESSION, environmentId: "env-123" });
    expect(decoded.environmentId).toBe("env-123");
  });

  it("carries the real run duration for a terminal session", () => {
    const decoded = decode({
      ...LEGACY_SESSION,
      phase: "stopped",
      durationSeconds: 4 * 3600,
    });
    expect(decoded.phase).toBe("stopped");
    expect(decoded.durationSeconds).toBe(4 * 3600);
  });

  it("accepts the cancelled phase and rejects an unknown one", () => {
    expect(decode({ ...LEGACY_SESSION, phase: "cancelled" }).phase).toBe("cancelled");
    expect(() => decode({ ...LEGACY_SESSION, phase: "exploded" })).toThrow();
  });

  it("decodes a full list result", () => {
    const decoded = Schema.decodeUnknownSync(CloudSessionListResultSchema)({
      sessions: [{ ...LEGACY_SESSION, phase: "cancelled" as const }],
      configured: true,
    });
    expect(decoded.configured).toBe(true);
    expect(decoded.sessions[0]?.phase).toBe("cancelled");
  });

  it("keeps the phase vocabulary intact end to end", () => {
    // Guards against a phase being dropped from the schema: every literal the
    // contract type knows must decode.
    const phases = [
      "requested",
      "queued",
      "preparing",
      "starting",
      "ready",
      "failed",
      "stopped",
      "cancelled",
    ] as const;
    for (const phase of phases) {
      expect(decode({ ...LEGACY_SESSION, phase }).phase).toBe(phase);
    }
  });
});
