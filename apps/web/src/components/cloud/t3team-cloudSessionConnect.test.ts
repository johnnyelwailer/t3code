import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { findCloudSessionEnvironment } from "./t3team-cloudSessionConnect";

const env = (environmentId: string, label: string) => ({
  environmentId: EnvironmentId.make(environmentId),
  label,
});

const session = (machineLabel: string, phase: "ready" | "preparing" | "failed") => ({
  machineLabel,
  phase,
});

describe("findCloudSessionEnvironment", () => {
  it("matches the session's machine label to a catalog environment", () => {
    const environments = [env("env-1", "This device"), env("env-2", "ubuntu-slim · 12 GB · 4 cores")];
    expect(
      findCloudSessionEnvironment(environments, session("ubuntu-slim · 12 GB · 4 cores", "ready")),
    ).toBe(environments[1]);
  });

  it("ignores case and surrounding whitespace when matching labels", () => {
    const environments = [env("env-1", "  Ubuntu-Slim ")];
    expect(findCloudSessionEnvironment(environments, session("ubuntu-slim", "ready"))).toBe(environments[0]);
  });

  it("returns null for a non-ready session", () => {
    const environments = [env("env-1", "ubuntu-slim")];
    expect(findCloudSessionEnvironment(environments, session("ubuntu-slim", "preparing"))).toBeNull();
    expect(findCloudSessionEnvironment(environments, session("ubuntu-slim", "failed"))).toBeNull();
  });

  it("returns null when the catalog does not carry that machine yet", () => {
    const environments = [env("env-1", "This device")];
    expect(findCloudSessionEnvironment(environments, session("machine-not-here", "ready"))).toBeNull();
  });

  it("returns null for a blank machine label", () => {
    const environments = [env("env-1", "   ")];
    expect(findCloudSessionEnvironment(environments, session("   ", "ready"))).toBeNull();
  });
});
