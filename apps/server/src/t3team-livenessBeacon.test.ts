// @effect-diagnostics nodeBuiltinImport:off - the beacon outlives a blocked main thread, so it runs in a child process.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

import { DesktopBackendLivenessBeacon } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

const decodeBeacon = Schema.decodeUnknownSync(Schema.fromJsonString(DesktopBackendLivenessBeacon));

describe("liveness beacon", () => {
  it("keeps writing while the event loop is blocked and reports the stall", () => {
    const result = NodeChildProcess.spawnSync(
      process.execPath,
      ["--no-warnings", NodePath.join(import.meta.dirname, "t3team-livenessBeacon.fixture.mjs")],
      { stdio: ["ignore", "pipe", "pipe", "pipe"], encoding: "utf8", timeout: 30_000 },
    );
    expect(result.status, result.stderr).toBe(0);

    const beacons = String(result.output[3] ?? "")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => decodeBeacon(line));
    const writtenWhileBlocked = beacons.filter((beacon) => beacon.stalledForMs >= 500);
    expect(writtenWhileBlocked.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...beacons.map((beacon) => beacon.maxStallMs))).toBeGreaterThanOrEqual(1_200);
    expect(beacons.at(-1)?.stalledForMs).toBeLessThan(500);
  });
});
