import type {
  EnvironmentId,
  OrchestrationMessage,
  OrchestrationProjectShell,
  OrchestrationThread,
  OrchestrationThreadShell,
} from "@t3tools/contracts";

export interface EnvironmentProject extends OrchestrationProjectShell {
  readonly environmentId: EnvironmentId;
}

export interface EnvironmentThreadShell extends OrchestrationThreadShell {
  readonly environmentId: EnvironmentId;
}

export type EnvironmentMessage = OrchestrationMessage;

export interface EnvironmentThread extends OrchestrationThread {
  readonly environmentId: EnvironmentId;
  /**
   * Shell-sourced live state that only exists on the merged thread (see
   * `mergeEnvironmentThread`): the detail stream does not carry it. Absent
   * while only the cached detail is known.
   */
  readonly backgroundLiveness?: OrchestrationThreadShell["backgroundLiveness"];
  readonly planProgress?: OrchestrationThreadShell["planProgress"];
  /**
   * Whether the thread has a pending user-input request (a question docked in
   * the composer). Shell-sourced live state, like backgroundLiveness: the
   * detail stream does not carry it. Drives the parent-side pending-question
   * indicator (sub-run tree / Agents panel).
   */
  readonly hasPendingUserInput?: boolean | undefined;
}

export function scopeProject(
  environmentId: EnvironmentId,
  project: OrchestrationProjectShell,
): EnvironmentProject {
  return { ...project, environmentId };
}

export function scopeThreadShell(
  environmentId: EnvironmentId,
  thread: OrchestrationThreadShell,
): EnvironmentThreadShell {
  return { ...thread, environmentId };
}

export function scopeThread(
  environmentId: EnvironmentId,
  thread: OrchestrationThread,
): EnvironmentThread {
  return { ...thread, environmentId };
}
