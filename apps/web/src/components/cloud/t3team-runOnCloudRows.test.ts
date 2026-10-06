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
  });

  it("still folds the same ordinary machine reachable under two ids", () => {
    const rows = runOnRows(
      [PRIMARY, env("a", "nx-nexi"), env("b", "nx-nexi")],
      [],
      PRIMARY.environmentId,
    );
    expect(rows.machines).toHaveLength(2);
  });
});
