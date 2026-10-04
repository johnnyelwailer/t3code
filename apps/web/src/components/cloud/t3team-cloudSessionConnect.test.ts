import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveCloudSessionEnvironment,
  type RelayEnvironmentCandidate,
} from "./t3team-cloudSessionConnect";

const PRIMARY = "env-primary";

const relay = (environmentId: string, label: string): RelayEnvironmentCandidate => ({
  environmentId: EnvironmentId.make(environmentId),
  label,
});

const ctx = (
  relayEnvironments: RelayEnvironmentCandidate[],
  environmentIdsBefore: ReadonlySet<string> | null = null,
) => ({
  relayEnvironments,
  primaryEnvironmentId: EnvironmentId.make(PRIMARY),
  environmentIdsBefore,
});

const session = (
  overrides: {
    readonly phase?: "ready" | "preparing" | "failed" | "cancelled";
    readonly machineLabel?: string;
    readonly environmentId?: string;
  } = {},
) => ({
  phase: "ready" as const,
  machineLabel: "ubuntu-slim · 12 GB · 4 cores",
  ...overrides,
});

describe("resolveCloudSessionEnvironment", () => {
  it("returns null for a session that is not ready", () => {
    const environment = relay("env-m", "Some host");
    for (const phase of ["preparing", "failed", "cancelled"] as const) {
      expect(resolveCloudSessionEnvironment(session({ phase }), ctx([environment]))).toBeNull();
    }
  });

  it("returns null when relay discovery carries no environment at all", () => {
    expect(resolveCloudSessionEnvironment(session(), ctx([]))).toBeNull();
  });

  it("excludes the client's own (primary) environment from being picked", () => {
    // A single candidate that IS the primary is not the machine the user started.
    expect(
      resolveCloudSessionEnvironment(session(), ctx([relay(PRIMARY, "This device")])),
    ).toBeNull();
  });

  it("uses the environment id carried on the record when the server supplies it", () => {
    const environments = [relay("env-a", "host-a"), relay("env-b", "host-b")];
    const result = resolveCloudSessionEnvironment(
      session({ environmentId: "env-b" }),
      ctx(environments, new Set(["env-a"])),
    );
    expect(result?.environmentId).toBe("env-b");
  });

  it("prefers the environment that appeared after the session was requested", () => {
    const environments = [relay("env-old", "host-old"), relay("env-new", "host-new")];
    const result = resolveCloudSessionEnvironment(
      session(),
      ctx(environments, new Set(["env-old"])),
    );
    expect(result?.environmentId).toBe("env-new");
  });

  it("falls back to the only candidate when nothing newly appeared (workspace reuse)", () => {
    // The relay reused an existing link, so no environment is "new"; a single
    // non-primary candidate is still attributable.
    const result = resolveCloudSessionEnvironment(
      session(),
      ctx([relay("env-only", "host-only")], new Set(["env-other"])),
    );
    expect(result?.environmentId).toBe("env-only");
  });

  it("returns null when several environments appeared at once (ambiguous)", () => {
    const environments = [relay("env-a", "host-a"), relay("env-b", "host-b")];
    expect(
      resolveCloudSessionEnvironment(session(), ctx(environments, new Set<string>())),
    ).toBeNull();
  });

  it("disambiguates by machine label when one candidate's label matches", () => {
    const environments = [relay("env-a", "host-a"), relay("env-b", "Fleet Runner 3")];
    const result = resolveCloudSessionEnvironment(
      session({ machineLabel: "fleet runner 3" }),
      ctx(environments, new Set<string>()),
    );
    expect(result?.environmentId).toBe("env-b");
  });

  it("matches the machine label case- and whitespace-insensitively", () => {
    const result = resolveCloudSessionEnvironment(
      session({ machineLabel: "  Host-1 " }),
      ctx([relay("env-1", "host-1")], new Set<string>()),
    );
    expect(result?.environmentId).toBe("env-1");
  });

  it("returns null when a session carries an id the relay has not surfaced yet", () => {
    // The record points at an environment discovery has not delivered: better
    // to say "from the environment list" than connect to the wrong machine.
    expect(
      resolveCloudSessionEnvironment(
        session({ environmentId: "env-unknown" }),
        ctx([relay("env-a", "host-a")]),
      ),
    ).toBeNull();
  });
});
