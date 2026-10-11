/** Minimal thread shells and facts for the PR-watch selector tests. */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type T3TeamThreadFacts,
  type ThreadPullRequestLink,
} from "@t3tools/contracts";

export const ENV = EnvironmentId.make("env-a");
export const OTHER_ENV = EnvironmentId.make("env-b");
export const PROJECT = ProjectId.make("project-a");

export function shell(
  input: Omit<Partial<EnvironmentThreadShell>, "id"> & {
    id: string;
    pullRequests?: ReadonlyArray<ThreadPullRequestLink>;
  },
): EnvironmentThreadShell {
  const { id, ...rest } = input;
  return {
    environmentId: ENV,
    id: ThreadId.make(id),
    projectId: PROJECT,
    title: `Thread ${id}`,
    runtimeMode: "full-access",
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    runtime: null,
    latestRun: null,
    pullRequests: [],
    archivedAt: null,
    deletedAt: null,
    updatedAt: "2026-10-08T09:00:00.000Z",
    ...rest,
  } as EnvironmentThreadShell;
}

export function facts(
  threadId: string,
  input: Partial<Omit<T3TeamThreadFacts, "threadId">>,
): [ThreadId, T3TeamThreadFacts] {
  const id = ThreadId.make(threadId);
  return [id, { threadId: id, updatedAt: "2026-10-08T09:00:00.000Z", ...input }];
}
