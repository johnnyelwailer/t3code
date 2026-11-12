import {
  type EnvironmentId,
  type ProjectId,
  type ProjectMachineSourceSetting,
  machineSourceAcceptedFrom,
} from "@t3tools/contracts";

import { type MachineSourceTarget, resolveMachineSourceTarget } from "./t3team-machineSourceTarget";

type TargetInput = Parameters<typeof resolveMachineSourceTarget>[0];

/**
 * What an accepted machine-source proposal will save and where, fixed at the moment the user
 * submits the answer. The save runs after the answer is delivered, by which time the composer may
 * show another thread; resolving the target here keeps the proposal on the project it was answered
 * in. Null for any answer that is not an accepted proposal.
 */
export function captureMachineSourceApply<P extends TargetInput["projects"][number]>(input: {
  readonly questions: Parameters<typeof machineSourceAcceptedFrom>[0];
  readonly answers: Record<string, unknown>;
  readonly thread: { readonly environmentId: EnvironmentId; readonly projectId: ProjectId | null };
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly projects: ReadonlyArray<P>;
}): {
  readonly source: ProjectMachineSourceSetting;
  readonly target: MachineSourceTarget<P>;
} | null {
  const source = machineSourceAcceptedFrom(input.questions, input.answers);
  if (source === null) return null;
  return {
    source,
    target: resolveMachineSourceTarget({
      thread: input.thread,
      primaryEnvironmentId: input.primaryEnvironmentId,
      projects: input.projects,
    }),
  };
}
