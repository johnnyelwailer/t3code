import {
  type EnvironmentId,
  type ProjectId,
  type RepositoryIdentity,
  repositoryGroupingKeyOf,
} from "@t3tools/contracts";
import { isSameCloudSessionProject } from "@t3tools/shared/t3team-cloudSessionFit";

interface TargetProject {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly repositoryIdentity?: RepositoryIdentity | null | undefined;
  readonly isScratch?: true | undefined;
}

export type MachineSourceTarget<P extends TargetProject> =
  | { readonly kind: "project"; readonly project: P }
  | { readonly kind: "none" | "ambiguous" };

const repositoryOf = (project: TargetProject) =>
  project.repositoryIdentity ? repositoryGroupingKeyOf(project.repositoryIdentity) : null;

/**
 * The primary-environment project a machine source is saved on, for the project of the thread the
 * user answered in. A cloud session's server registers its checkout as its project, so that
 * project is a copy of the user's own: the target is the primary environment's project it fits
 * (the same repository, and `isSameCloudSessionProject`, the rule the cloud thread's title uses).
 * Never a guess: no such project is "none", several are "ambiguous".
 */
export function resolveMachineSourceTarget<P extends TargetProject>(input: {
  readonly thread: { readonly environmentId: EnvironmentId; readonly projectId: ProjectId | null };
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly projects: ReadonlyArray<P>;
}): MachineSourceTarget<P> {
  const { thread, primaryEnvironmentId } = input;
  const own = input.projects.find(
    (project) => project.environmentId === thread.environmentId && project.id === thread.projectId,
  );
  if (own === undefined || primaryEnvironmentId === null || own.isScratch === true) {
    return { kind: "none" };
  }
  if (own.environmentId === primaryEnvironmentId) return { kind: "project", project: own };
  const repository = repositoryOf(own);
  const candidates = input.projects.filter(
    (candidate) =>
      candidate.environmentId === primaryEnvironmentId &&
      candidate.isScratch !== true &&
      repositoryOf(candidate) === repository &&
      isSameCloudSessionProject(candidate, own),
  );
  if (candidates.length > 1) return { kind: "ambiguous" };
  const [only] = candidates;
  return only === undefined ? { kind: "none" } : { kind: "project", project: only };
}
