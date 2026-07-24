import { EnvironmentId } from "@t3tools/contracts";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";

export const ENVIRONMENT_ID = EnvironmentId.make("environment-a");

export function createContextAttachmentRequest(
  overrides?: Partial<AddToChatRequest>,
): AddToChatRequest {
  return {
    projectId: "project-alpha",
    projectTitle: "Project Alpha",
    projectWorkspaceRoot: "/tmp/project-alpha",
    targetLabel: "PROJ-7 Investigate context sync",
    targetType: "work-item",
    kind: "jira-work-item",
    dedupeKey: "project-alpha:PROJ-7:work-item",
    summaryItems: [{ label: "Status", value: "In Progress" }],
    payload: { ok: true },
    ...overrides,
  };
}

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
