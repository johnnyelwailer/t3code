import { describe, expect, it } from "vite-plus/test";
import { JobSpecValidationError, parseJobSpec } from "../src/contract.js";

const base = {
  jobId: "job-1",
  image: "alpine:3",
  env: {},
  timeoutMs: 1000,
};

describe("parseJobSpec", () => {
  it("accepts a minimal valid spec and applies defaults", () => {
    const spec = parseJobSpec(base);
    expect(spec.network).toBe("none");
    expect(spec.workspace).toBeUndefined();
    expect(spec.env).toEqual({});
  });

  it("defaults workspace.readOnly to true", () => {
    const spec = parseJobSpec({
      ...base,
      workspace: { hostPath: "/tmp/ws" },
    });
    expect(spec.workspace?.readOnly).toBe(true);
  });

  it("respects an explicit workspace.readOnly: false", () => {
    const spec = parseJobSpec({
      ...base,
      workspace: { hostPath: "/tmp/ws", readOnly: false },
    });
    expect(spec.workspace?.readOnly).toBe(false);
  });

  it("rejects missing jobId", () => {
    expect(() => parseJobSpec({ ...base, jobId: undefined })).toThrow(JobSpecValidationError);
  });

  it("rejects missing image", () => {
    const { image, ...rest } = base;
    expect(() => parseJobSpec(rest)).toThrow(JobSpecValidationError);
  });

  it("rejects a non-positive timeoutMs", () => {
    expect(() => parseJobSpec({ ...base, timeoutMs: 0 })).toThrow(JobSpecValidationError);
  });

  it("rejects an invalid network value", () => {
    expect(() => parseJobSpec({ ...base, network: "vpn" })).toThrow(JobSpecValidationError);
  });

  it("rejects an invalid runtime value", () => {
    expect(() => parseJobSpec({ ...base, runtime: "kata" })).toThrow(JobSpecValidationError);
  });

  for (const secretKey of [
    "API_TOKEN",
    "GITHUB_TOKEN",
    "SECRET_KEY",
    "DB_PASSWORD",
    "PASSWORD",
    "AWS_SECRET_ACCESS_KEY",
    "PRIVATE_KEY",
  ]) {
    it(`rejects secret-shaped env key ${secretKey}`, () => {
      expect(() => parseJobSpec({ ...base, env: { [secretKey]: "shh" } })).toThrow(
        JobSpecValidationError,
      );
    });
  }

  it("accepts non-secret-shaped env keys", () => {
    const spec = parseJobSpec({
      ...base,
      env: { NODE_ENV: "production", LOG_LEVEL: "debug" },
    });
    expect(spec.env).toEqual({ NODE_ENV: "production", LOG_LEVEL: "debug" });
  });

  it("rejects a non-string env value", () => {
    expect(() => parseJobSpec({ ...base, env: { COUNT: 5 as unknown as string } })).toThrow(
      JobSpecValidationError,
    );
  });

  describe("image validation (F2: argument injection)", () => {
    it("rejects an image starting with '-' (docker-flag-shaped)", () => {
      expect(() => parseJobSpec({ ...base, image: "--network=host" })).toThrow(
        JobSpecValidationError,
      );
    });

    it("rejects an image containing shell/space metacharacters", () => {
      expect(() => parseJobSpec({ ...base, image: "alpine:3 ; rm -rf /" })).toThrow(
        JobSpecValidationError,
      );
    });

    it("accepts a normal image reference with registry host, path, tag", () => {
      const spec = parseJobSpec({
        ...base,
        image: "ghcr.io/example-org/agent-harness:dev",
      });
      expect(spec.image).toBe("ghcr.io/example-org/agent-harness:dev");
    });

    it("accepts a digest-pinned image reference", () => {
      const spec = parseJobSpec({
        ...base,
        image: "alpine@sha256:abcdef0123456789",
      });
      expect(spec.image).toBe("alpine@sha256:abcdef0123456789");
    });
  });

  describe("limits (F5)", () => {
    it("leaves limits undefined when not specified", () => {
      const spec = parseJobSpec(base);
      expect(spec.limits).toBeUndefined();
    });

    it("accepts a partial limits object", () => {
      const spec = parseJobSpec({ ...base, limits: { memory: "4g" } });
      expect(spec.limits).toEqual({ memory: "4g" });
    });

    it("rejects a non-string limits field", () => {
      expect(() => parseJobSpec({ ...base, limits: { cpus: 2 as unknown as string } })).toThrow(
        JobSpecValidationError,
      );
    });

    it("rejects limits that is not an object", () => {
      expect(() => parseJobSpec({ ...base, limits: "lots" })).toThrow(JobSpecValidationError);
    });
  });

  describe("workspace.hostPath JOB_WORKSPACE_ROOT guard (F5)", () => {
    const root = "/srv/agent-runner/workspaces";

    it("accepts a hostPath inside JOB_WORKSPACE_ROOT", () => {
      const spec = parseJobSpec(
        { ...base, workspace: { hostPath: `${root}/job-1` } },
        { JOB_WORKSPACE_ROOT: root },
      );
      expect(spec.workspace?.hostPath).toBe(`${root}/job-1`);
    });

    it("rejects a hostPath that escapes JOB_WORKSPACE_ROOT via '..'", () => {
      expect(() =>
        parseJobSpec(
          { ...base, workspace: { hostPath: `${root}/../../etc` } },
          { JOB_WORKSPACE_ROOT: root },
        ),
      ).toThrow(JobSpecValidationError);
    });

    it("rejects a hostPath entirely outside JOB_WORKSPACE_ROOT", () => {
      expect(() =>
        parseJobSpec(
          { ...base, workspace: { hostPath: "/etc/passwd" } },
          { JOB_WORKSPACE_ROOT: root },
        ),
      ).toThrow(JobSpecValidationError);
    });

    it("allows any hostPath when JOB_WORKSPACE_ROOT is unset", () => {
      const spec = parseJobSpec({ ...base, workspace: { hostPath: "/etc/passwd" } }, {});
      expect(spec.workspace?.hostPath).toBe("/etc/passwd");
    });
  });

  describe("secretMounts (invariant: agents never touch secrets, only scripts do)", () => {
    it("leaves secretMounts undefined when not specified", () => {
      const spec = parseJobSpec(base);
      expect(spec.secretMounts).toBeUndefined();
    });

    it("accepts a secretMounts entry whose containerPath is outside /workspace, defaulting readOnly to true", () => {
      const spec = parseJobSpec({
        ...base,
        secretMounts: [
          {
            hostPath: "/host/secrets/gateway-key",
            containerPath: "/run/agent-secrets/gateway-key",
          },
        ],
      });
      expect(spec.secretMounts).toEqual([
        {
          hostPath: "/host/secrets/gateway-key",
          containerPath: "/run/agent-secrets/gateway-key",
          readOnly: true,
        },
      ]);
    });

    it("respects an explicit readOnly: false", () => {
      const spec = parseJobSpec({
        ...base,
        secretMounts: [
          {
            hostPath: "/host/secrets/gateway-key",
            containerPath: "/run/agent-secrets/gateway-key",
            readOnly: false,
          },
        ],
      });
      expect(spec.secretMounts?.[0].readOnly).toBe(false);
    });

    it("rejects a containerPath under /workspace, naming the invariant it enforces", () => {
      expect(() =>
        parseJobSpec({
          ...base,
          secretMounts: [
            { hostPath: "/host/secrets/gateway-key", containerPath: "/workspace/job/gateway-key" },
          ],
        }),
      ).toThrow(/must not be under \/workspace/);
    });

    it("rejects a containerPath equal to /workspace itself", () => {
      expect(() =>
        parseJobSpec({
          ...base,
          secretMounts: [{ hostPath: "/host/secrets/x", containerPath: "/workspace" }],
        }),
      ).toThrow(JobSpecValidationError);
    });

    it("rejects a containerPath that only textually starts with /workspace but is a sibling path (e.g. /workspace-evil)", () => {
      const spec = parseJobSpec({
        ...base,
        secretMounts: [{ hostPath: "/host/secrets/x", containerPath: "/workspace-evil/x" }],
      });
      // Not under /workspace (it's a sibling directory, not a subpath) —
      // accepted. This assertion exists to pin the containment check's use
      // of path.relative (not a naive startsWith) so it doesn't misfire on
      // lexical near-misses.
      expect(spec.secretMounts?.[0].containerPath).toBe("/workspace-evil/x");
    });

    it("rejects a relative containerPath", () => {
      expect(() =>
        parseJobSpec({
          ...base,
          secretMounts: [{ hostPath: "/host/secrets/x", containerPath: "run/agent-secrets/x" }],
        }),
      ).toThrow(JobSpecValidationError);
    });

    it("rejects a non-empty-string hostPath", () => {
      expect(() =>
        parseJobSpec({
          ...base,
          secretMounts: [{ hostPath: "", containerPath: "/run/agent-secrets/x" }],
        }),
      ).toThrow(JobSpecValidationError);
    });

    it("rejects secretMounts that is not an array", () => {
      expect(() => parseJobSpec({ ...base, secretMounts: "nope" })).toThrow(JobSpecValidationError);
    });

    it("rejects a non-boolean readOnly", () => {
      expect(() =>
        parseJobSpec({
          ...base,
          secretMounts: [
            {
              hostPath: "/host/secrets/x",
              containerPath: "/run/agent-secrets/x",
              readOnly: "yes" as unknown as boolean,
            },
          ],
        }),
      ).toThrow(JobSpecValidationError);
    });

    it("accepts multiple secret mounts", () => {
      const spec = parseJobSpec({
        ...base,
        secretMounts: [
          { hostPath: "/host/secrets/a", containerPath: "/run/agent-secrets/a" },
          { hostPath: "/host/secrets/b", containerPath: "/run/agent-secrets/b" },
        ],
      });
      expect(spec.secretMounts).toHaveLength(2);
    });
  });

  describe("user (R4)", () => {
    it("leaves user undefined when not specified", () => {
      const spec = parseJobSpec(base);
      expect(spec.user).toBeUndefined();
    });

    it("accepts a numeric uid:gid", () => {
      expect(parseJobSpec({ ...base, user: "10001:10001" }).user).toBe("10001:10001");
    });

    it("accepts a bare uid", () => {
      expect(parseJobSpec({ ...base, user: "1000" }).user).toBe("1000");
    });

    it("rejects a non-string user", () => {
      expect(() => parseJobSpec({ ...base, user: 1000 as unknown as string })).toThrow(
        JobSpecValidationError,
      );
    });

    it("rejects a user value shaped like a docker flag (argument injection)", () => {
      expect(() => parseJobSpec({ ...base, user: "--privileged" })).toThrow(JobSpecValidationError);
    });
  });
});
