import { type CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { runOnRows } from "./t3team-runOnCloudRows";

const env = (id: string, label: string, isPrimary = false) => ({
  environmentId: EnvironmentId.make(id),
  projectId: ProjectId.make("p"),
  label,
  isPrimary,
  machine: "server" as const,
});
const session = (id: string, fields: Partial<CloudSession> = {}) =>
  ({
    sessionId: id,
    phase: "ready",
    machineLabel: "ubuntu-slim",
    remainingSeconds: null,
    environmentId: `env-${id}`,
    ...fields,
  }) as CloudSession;
const PRIMARY = env("local", "This computer", true);

describe("runOnRows", () => {
  it("keeps two connected cloud machines with the same stored label apart", () => {
    const rows = runOnRows(
      [PRIMARY, env("env-1", "Cloud session"), env("env-2", "Cloud session")],
      [session("1", { name: "api" }), session("2")],
      PRIMARY.environmentId,
    );
    expect(rows.machines).toEqual([PRIMARY]);
    expect(rows.cloud.map((row) => row.environment?.environmentId)).toEqual(["env-1", "env-2"]);
    expect(rows.cloud.map((row) => row.environment?.label)).toEqual(["api", "Cloud session"]);
  });

  it("gives a session whose machine is not connected here no environment", () => {
    const rows = runOnRows([PRIMARY], [session("1")], PRIMARY.environmentId);
    expect(rows.cloud[0]?.environment).toBeNull();
    expect(rows.cloud[0]?.unavailable).toBe(false);
  });

  it("marks a machine connected without this project as unavailable, not as one to connect", () => {
    const rows = runOnRows([PRIMARY], [session("1")], PRIMARY.environmentId, {
      connected: new Set(["env-1"]),
    });
    expect(rows.cloud[0]?.environment).toBeNull();
    expect(rows.cloud[0]?.unavailable).toBe(true);
  });

  it("still folds the same ordinary machine reachable under two ids", () => {
    const rows = runOnRows(
      [PRIMARY, env("a", "nx-nexi"), env("b", "nx-nexi")],
      [],
      PRIMARY.environmentId,
    );
    expect(rows.machines).toHaveLength(2);
  });

  it("leaves out a finished cloud machine, unless the thread is on it", () => {
    const ended = env("env-old", "nexi-machine-qa · 12:20 PM");
    const cloud = new Set(["env-old"]);
    expect(runOnRows([PRIMARY, ended], [], PRIMARY.environmentId, { cloud }).machines).toEqual([
      PRIMARY,
    ]);
    expect(
      runOnRows([PRIMARY, ended], [], ended.environmentId, { cloud }).machines.map(
        (machine) => machine.environmentId,
      ),
    ).toEqual(["local", "env-old"]);
  });

  it("keeps a connected cloud machine even before its session is listed", () => {
    const live = env("env-live", "Cloud session");
    const rows = runOnRows([PRIMARY, live], [], PRIMARY.environmentId, {
      cloud: new Set(["env-live"]),
      connected: new Set(["env-live"]),
    });
    expect(rows.machines.map((machine) => machine.environmentId)).toEqual(["local", "env-live"]);
  });
});
