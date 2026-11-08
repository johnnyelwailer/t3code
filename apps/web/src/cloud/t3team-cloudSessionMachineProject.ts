/**
 * The project a cloud machine's own server registered, found in this app's project list.
 *
 * The server names it two ways: its welcome carries `bootstrapProjectId` (the exact id), and its
 * settings carry the working directory it registered (`projectCwdOf`). The id is authoritative:
 * it does not depend on the settings having arrived, nor on path spelling, and it is not fooled
 * by a restored project that happens to sit at the same folder. The folder is the fallback for a
 * welcome that has not reached this app, names none, or names a project not listed yet. Pure.
 */
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { ownProjectOnMachine } from "@t3tools/shared/t3team-cloudSessionFit";

export type MachineProjectBinding = "bootstrap-id" | "folder";

export interface MachineOwnProject<P> {
  /** The listed project, or undefined while the machine's own project is not listed here. */
  readonly project: P | undefined;
  readonly by: MachineProjectBinding | null;
  /** The machine names its own project at all (an id or a folder): absence of it is a wait. */
  readonly named: boolean;
}

export function resolveMachineOwnProject<
  P extends {
    readonly environmentId: EnvironmentId;
    readonly id: ProjectId;
    readonly workspaceRoot: string;
  },
>(input: {
  readonly environmentId: EnvironmentId;
  readonly bootstrapProjectId: ProjectId | null;
  readonly cwd: string | null;
  readonly projects: ReadonlyArray<P>;
}): MachineOwnProject<P> {
  const there = input.projects.filter((project) => project.environmentId === input.environmentId);
  const byId =
    input.bootstrapProjectId === null
      ? undefined
      : there.find((project) => project.id === input.bootstrapProjectId);
  if (byId !== undefined) return { project: byId, by: "bootstrap-id", named: true };
  const byFolder = input.cwd === null ? undefined : ownProjectOnMachine(input.cwd, there);
  return {
    project: byFolder,
    by: byFolder === undefined ? null : "folder",
    named: input.bootstrapProjectId !== null || input.cwd !== null,
  };
}
