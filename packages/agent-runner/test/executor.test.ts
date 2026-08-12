import { Readable } from "node:stream";
import { describe, expect, it } from "vite-plus/test";
import { JobSpecValidationError, type JobSpec } from "../src/contract.js";
import {
  DEFAULT_CPUS,
  DEFAULT_MAX_LINE_BYTES,
  DEFAULT_MAX_TOTAL_OUTPUT_BYTES,
  DEFAULT_MEMORY_LIMIT,
  DEFAULT_MEMORY_SWAP,
  DEFAULT_PIDS_LIMIT,
  GATEWAY_EGRESS_NETWORK,
  NotImplementedError,
  type OutputBudget,
  attachLineStream,
  buildDockerRunArgs,
  runJob,
} from "../src/executor.js";

const baseSpec: JobSpec = {
  jobId: "abc123",
  image: "alpine:3",
  env: {},
  timeoutMs: 5000,
  network: "none",
};

describe("buildDockerRunArgs", () => {
  it("includes --rm, --name, memory and pids limits", () => {
    const args = buildDockerRunArgs(baseSpec);
    expect(args).toContain("--rm");
    expect(args).toEqual(expect.arrayContaining(["--name", "job-abc123"]));
    expect(args).toEqual(expect.arrayContaining(["--memory", DEFAULT_MEMORY_LIMIT]));
    expect(args).toEqual(expect.arrayContaining(["--pids-limit", DEFAULT_PIDS_LIMIT]));
    expect(args).toEqual(expect.arrayContaining(["--cpus", DEFAULT_CPUS]));
    expect(args).toEqual(expect.arrayContaining(["--memory-swap", DEFAULT_MEMORY_SWAP]));
  });

  it("puts `--` before the image so a `-`-leading image string can never be parsed as a docker flag (F2)", () => {
    const args = buildDockerRunArgs(baseSpec);
    const sepIdx = args.indexOf("--");
    expect(sepIdx).toBeGreaterThan(-1);
    expect(args[sepIdx + 1]).toBe("alpine:3");
  });

  it("overrides memory/memorySwap/cpus/pids via JobSpec.limits", () => {
    const args = buildDockerRunArgs({
      ...baseSpec,
      limits: { memory: "4g", memorySwap: "4g", cpus: "1.5", pids: "128" },
    });
    expect(args).toEqual(expect.arrayContaining(["--memory", "4g"]));
    expect(args).toEqual(expect.arrayContaining(["--memory-swap", "4g"]));
    expect(args).toEqual(expect.arrayContaining(["--cpus", "1.5"]));
    expect(args).toEqual(expect.arrayContaining(["--pids-limit", "128"]));
  });

  it("defaults memorySwap to the effective (overridden) memory limit when only limits.memory is set", () => {
    const args = buildDockerRunArgs({ ...baseSpec, limits: { memory: "500m" } });
    expect(args).toEqual(expect.arrayContaining(["--memory", "500m"]));
    expect(args).toEqual(expect.arrayContaining(["--memory-swap", "500m"]));
  });

  it("uses --network none for network: 'none'", () => {
    const args = buildDockerRunArgs({ ...baseSpec, network: "none" });
    expect(args).toEqual(expect.arrayContaining(["--network", "none"]));
  });

  it("adds no --network flag for network: 'open' (default bridge)", () => {
    const args = buildDockerRunArgs({ ...baseSpec, network: "open" });
    expect(args).not.toContain("--network");
  });

  it("throws NotImplementedError for network: 'gateway-only' without a ready network", () => {
    expect(() => buildDockerRunArgs({ ...baseSpec, network: "gateway-only" })).toThrow(
      NotImplementedError,
    );
  });

  it("uses the agent-runner-egress network for gateway-only once ready", () => {
    const args = buildDockerRunArgs(
      { ...baseSpec, network: "gateway-only" },
      { gatewayNetworkReady: true },
    );
    expect(args).toEqual(expect.arrayContaining(["--network", GATEWAY_EGRESS_NETWORK]));
  });

  it("mounts the workspace read-only by default", () => {
    const args = buildDockerRunArgs({
      ...baseSpec,
      workspace: { hostPath: "/host/ws" },
    });
    expect(args).toEqual(expect.arrayContaining(["-v", "/host/ws:/workspace:ro"]));
  });

  it("mounts the workspace read-write when readOnly: false", () => {
    const args = buildDockerRunArgs({
      ...baseSpec,
      workspace: { hostPath: "/host/ws", readOnly: false },
    });
    expect(args).toEqual(expect.arrayContaining(["-v", "/host/ws:/workspace:rw"]));
  });

  it("adds no volume flag when workspace is absent", () => {
    const args = buildDockerRunArgs(baseSpec);
    expect(args).not.toContain("-v");
  });

  describe("secretMounts", () => {
    it("adds a read-only -v mount for a secretMounts entry, alongside the workspace mount", () => {
      const args = buildDockerRunArgs({
        ...baseSpec,
        workspace: { hostPath: "/host/ws" },
        secretMounts: [
          {
            hostPath: "/host/secrets/gateway-key",
            containerPath: "/run/agent-secrets/gateway-key",
          },
        ],
      });
      expect(args).toEqual(expect.arrayContaining(["-v", "/host/ws:/workspace:ro"]));
      expect(args).toEqual(
        expect.arrayContaining([
          "-v",
          "/host/secrets/gateway-key:/run/agent-secrets/gateway-key:ro",
        ]),
      );
    });

    it("mounts secretMounts read-write when readOnly: false", () => {
      const args = buildDockerRunArgs({
        ...baseSpec,
        secretMounts: [
          {
            hostPath: "/host/secrets/gateway-key",
            containerPath: "/run/agent-secrets/gateway-key",
            readOnly: false,
          },
        ],
      });
      expect(args).toEqual(
        expect.arrayContaining([
          "-v",
          "/host/secrets/gateway-key:/run/agent-secrets/gateway-key:rw",
        ]),
      );
    });

    it("adds one -v pair per secretMounts entry, none colliding with the workspace mount", () => {
      const args = buildDockerRunArgs({
        ...baseSpec,
        workspace: { hostPath: "/host/ws", readOnly: false },
        secretMounts: [
          { hostPath: "/host/secrets/a", containerPath: "/run/agent-secrets/a" },
          { hostPath: "/host/secrets/b", containerPath: "/run/agent-secrets/b" },
        ],
      });
      const vFlagIndices = args.reduce<number[]>((acc, arg, i) => {
        if (arg === "-v") acc.push(i);
        return acc;
      }, []);
      // workspace + two secret mounts = 3 `-v` flags.
      expect(vFlagIndices).toHaveLength(3);
      expect(args).toEqual(expect.arrayContaining(["/host/ws:/workspace:rw"]));
      expect(args).toEqual(expect.arrayContaining(["/host/secrets/a:/run/agent-secrets/a:ro"]));
      expect(args).toEqual(expect.arrayContaining(["/host/secrets/b:/run/agent-secrets/b:ro"]));
    });

    it("adds no secret -v mount when secretMounts is absent", () => {
      const args = buildDockerRunArgs(baseSpec);
      expect(args.join(" ")).not.toContain("agent-secrets");
    });
  });

  it("adds --runtime=runsc when runtime is 'runsc'", () => {
    const args = buildDockerRunArgs({ ...baseSpec, runtime: "runsc" });
    expect(args).toContain("--runtime=runsc");
  });

  it("adds no --runtime flag by default (runc)", () => {
    const args = buildDockerRunArgs(baseSpec);
    expect(args.some((a) => a.startsWith("--runtime"))).toBe(false);
  });

  it("passes env vars as separate -e KEY=value argv pairs", () => {
    const args = buildDockerRunArgs({
      ...baseSpec,
      env: { FOO: "bar", BAZ: "qux" },
    });
    expect(args).toEqual(expect.arrayContaining(["-e", "FOO=bar"]));
    expect(args).toEqual(expect.arrayContaining(["-e", "BAZ=qux"]));
  });

  it("places image before cmd, and appends cmd argv untouched", () => {
    const args = buildDockerRunArgs({
      ...baseSpec,
      cmd: ["sh", "-c", "echo hello"],
    });
    const imageIdx = args.indexOf("alpine:3");
    expect(imageIdx).toBeGreaterThan(-1);
    expect(args.slice(imageIdx)).toEqual(["alpine:3", "sh", "-c", "echo hello"]);
  });

  it("never contains a single joined shell string for cmd", () => {
    const args = buildDockerRunArgs({
      ...baseSpec,
      cmd: ["sh", "-c", "echo hello; sleep 1"],
    });
    // Each element is its own argv entry; no element merges multiple
    // words from cmd together beyond what the caller supplied.
    expect(args).toContain("sh");
    expect(args).toContain("-c");
    expect(args).toContain("echo hello; sleep 1");
  });

  it("adds capability/rootfs hardening flags by default (R4)", () => {
    const args = buildDockerRunArgs(baseSpec);
    expect(args).toContain("--cap-drop=ALL");
    expect(args).toContain("--security-opt=no-new-privileges");
    expect(args).toContain("--read-only");
    expect(args).toEqual(expect.arrayContaining(["--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"]));
  });

  it("adds --user only when JobSpec.user is set (R4)", () => {
    expect(buildDockerRunArgs(baseSpec)).not.toContain("--user");
    const args = buildDockerRunArgs({ ...baseSpec, user: "10001:10001" });
    expect(args).toEqual(expect.arrayContaining(["--user", "10001:10001"]));
  });

  it("re-validates its input via parseJobSpec even though it's already typed as JobSpec (R1)", () => {
    // A secret-shaped env key must be rejected here too, not only via
    // parseJobSpec called separately — buildDockerRunArgs is the function
    // that actually produces the `docker run` invocation.
    expect(() => buildDockerRunArgs({ ...baseSpec, env: { GITHUB_TOKEN: "leaked" } })).toThrow(
      JobSpecValidationError,
    );
    expect(() => buildDockerRunArgs({ ...baseSpec, image: "--network=host" })).toThrow(
      JobSpecValidationError,
    );
  });
});

describe("runJob validates its JobSpec before touching Docker (R1)", () => {
  // These all fail during parseJobSpec, before runJob ever builds argv or
  // calls execa — so they need no Docker daemon and run unconditionally
  // (unlike test/integration.test.ts's happy-path cases).
  const base: JobSpec = {
    jobId: "r1-test",
    image: "alpine:3",
    env: {},
    timeoutMs: 5000,
    network: "none",
  };

  it("rejects a secret-shaped env key", async () => {
    await expect(
      runJob({ ...base, env: { GITHUB_TOKEN: "leaked" } }, { onEvent: () => {} }),
    ).rejects.toThrow(JobSpecValidationError);
  });

  it("rejects a workspace.hostPath outside JOB_WORKSPACE_ROOT", async () => {
    const original = process.env.JOB_WORKSPACE_ROOT;
    process.env.JOB_WORKSPACE_ROOT = "/srv/agent-runner/workspaces";
    try {
      await expect(
        runJob({ ...base, workspace: { hostPath: "/etc" } }, { onEvent: () => {} }),
      ).rejects.toThrow(JobSpecValidationError);
    } finally {
      if (original === undefined) {
        delete process.env.JOB_WORKSPACE_ROOT;
      } else {
        process.env.JOB_WORKSPACE_ROOT = original;
      }
    }
  });

  it("rejects a `-`-leading image", async () => {
    await expect(runJob({ ...base, image: "--privileged" }, { onEvent: () => {} })).rejects.toThrow(
      JobSpecValidationError,
    );
  });
});

describe("attachLineStream (R5)", () => {
  function fakeBudget(): OutputBudget {
    return { totalBytes: 0, capped: false };
  }

  it("forwards short lines unmodified with truncated: false-ish (undefined-equivalent)", async () => {
    const stream = new Readable({ read() {} });
    const lines: Array<{ line: string; truncated: boolean }> = [];
    attachLineStream(
      stream,
      (line, truncated) => lines.push({ line, truncated }),
      fakeBudget(),
      () => {},
    );

    stream.push("hello\nworld\n");
    stream.push(null);
    await new Promise((r) => setImmediate(r));

    expect(lines).toEqual([
      { line: "hello", truncated: false },
      { line: "world", truncated: false },
    ]);
  });

  it("truncates a single line exceeding the per-line byte cap and marks it truncated", async () => {
    const stream = new Readable({ read() {} });
    const lines: Array<{ line: string; truncated: boolean }> = [];
    const budget = fakeBudget();
    attachLineStream(
      stream,
      (line, truncated) => lines.push({ line, truncated }),
      budget,
      () => {},
      {
        maxLineBytes: 16,
      },
    );

    // One huge "line" with no newline — the exact shape that used to grow
    // `buffer += chunk` without limit. Ended via stream 'end', matching the
    // no-trailing-newline flush path.
    stream.push("x".repeat(10 * 1024 * 1024));
    stream.push(null);
    await new Promise((r) => setImmediate(r));

    expect(lines).toHaveLength(1);
    expect(lines[0].truncated).toBe(true);
    expect(lines[0].line.length).toBeLessThanOrEqual(16);
    // Bounded memory: the emitted line, not the original 10MB input.
    expect(Buffer.byteLength(lines[0].line, "utf8")).toBeLessThanOrEqual(16);
  });

  it("stops forwarding and calls onCapped exactly once after the total-bytes cap is hit", async () => {
    const stream = new Readable({ read() {} });
    const lines: string[] = [];
    let cappedCalls = 0;
    const budget = fakeBudget();
    attachLineStream(
      stream,
      (line) => lines.push(line),
      budget,
      () => {
        cappedCalls += 1;
      },
      { maxLineBytes: 1000, maxTotalOutputBytes: 30 },
    );

    // Each line is 10 bytes ("0123456789"); the 30-byte total cap should
    // stop forwarding after the third line.
    for (let i = 0; i < 10; i++) {
      stream.push("0123456789\n");
    }
    stream.push(null);
    await new Promise((r) => setImmediate(r));

    expect(cappedCalls).toBe(1);
    expect(lines.length).toBeLessThan(10);
    expect(budget.capped).toBe(true);
  });

  it("shares one budget across two streams (stdout+stderr combined cap)", async () => {
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    const budget = fakeBudget();
    let cappedCalls = 0;
    const onCapped = () => {
      cappedCalls += 1;
    };
    attachLineStream(stdout, () => {}, budget, onCapped, {
      maxLineBytes: 1000,
      maxTotalOutputBytes: 15,
    });
    attachLineStream(stderr, () => {}, budget, onCapped, {
      maxLineBytes: 1000,
      maxTotalOutputBytes: 15,
    });

    stdout.push("0123456789\n"); // 10 bytes, under the 15-byte shared cap
    stdout.push(null);
    stderr.push("0123456789\n"); // pushes the shared total to 20, over the cap
    stderr.push(null);
    await new Promise((r) => setImmediate(r));

    expect(cappedCalls).toBe(1);
  });

  it("does not throw on a stream 'error' event", () => {
    const stream = new Readable({ read() {} });
    attachLineStream(
      stream,
      () => {},
      fakeBudget(),
      () => {},
    );
    expect(() => stream.emit("error", new Error("boom"))).not.toThrow();
  });

  it("exposes the default caps used by runJob", () => {
    expect(DEFAULT_MAX_LINE_BYTES).toBeGreaterThan(0);
    expect(DEFAULT_MAX_TOTAL_OUTPUT_BYTES).toBeGreaterThan(DEFAULT_MAX_LINE_BYTES);
  });
});
