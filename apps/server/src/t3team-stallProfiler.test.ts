// @effect-diagnostics nodeBuiltinImport:off - the profiler attaches to the process's main thread, so it runs in a child process.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

describe("stall profiler", () => {
  it("writes a CPU profile that shows the call that blocked the event loop", () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-stall-"));
    try {
      const result = NodeChildProcess.spawnSync(
        process.execPath,
        [
          "--no-warnings",
          NodePath.join(import.meta.dirname, "t3team-stallProfiler.fixture.mjs"),
          directory,
        ],
        { encoding: "utf8", timeout: 60_000 },
      );
      expect(result.status, result.stderr).toBe(0);

      const { reported } = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}") as {
        reported?: { file: string; stalledForMs: number };
      };
      expect(reported?.stalledForMs).toBeGreaterThanOrEqual(300);
      const files = NodeFS.readdirSync(directory).filter((name) => name.endsWith(".cpuprofile"));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^stall-.*-\d+ms\.cpuprofile$/);

      const profile = JSON.parse(
        NodeFS.readFileSync(NodePath.join(directory, files[0] ?? ""), "utf8"),
      ) as {
        nodes: ReadonlyArray<{ callFrame: { functionName: string } }>;
      };
      expect(
        profile.nodes.some((node) => node.callFrame.functionName === "spinInsideTheBlockedCall"),
      ).toBe(true);
    } finally {
      NodeFS.rmSync(directory, { recursive: true, force: true });
    }
  });
});
