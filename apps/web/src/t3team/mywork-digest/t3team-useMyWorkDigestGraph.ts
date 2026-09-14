/**
 * Client-side adapter that assembles the My Work "digest" graph from what the My Work views
 * already hold (fetched tickets + GitHub activity). A sibling thread is replacing this file's
 * body with a server-backed implementation — keep the file path and the
 * `useMyWorkDigestGraph` signature EXACTLY as-is; only the internals may change.
 *
 * Every field that has no trustworthy source yet is a TODO(digest-data) gap, not a guess.
 */
import { useMemo } from "react";

import type {
  DigestChangeRequest,
  DigestGraph,
  DigestSprint,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type UseMyWorkDigestGraphStatus = "loading" | "ready" | "error";

export type UseMyWorkDigestGraphResult = {
  graph: DigestGraph | null;
  status: UseMyWorkDigestGraphStatus;
  error?: string;
};

function pullRequestNumber(item: GitHubWorkActivityItem): number {
  const match = item.subjectUrl?.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function changeRequestState(
  subjectState: GitHubWorkActivityItem["subjectState"],
  reviewRequested: boolean | undefined,
): DigestChangeRequest["state"] | undefined {
  switch (subjectState) {
    case "draft":
      return "waiting";
    case "merged":
      return "approved";
    case "open":
      // TODO(digest-data): distinguish needs-you / changes-requested / ci-failing from review +
      // CI state once the server-backed feed exposes it.
      return reviewRequested ? "needs-you" : "waiting";
    case "closed":
    case undefined:
      return undefined;
  }
}

function githubActivityToChangeRequests(
  items: readonly GitHubWorkActivityItem[],
): readonly DigestChangeRequest[] {
  const requests: DigestChangeRequest[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const ticketId = item.workItemKey;
    if (!ticketId || seen.has(item.id)) {
      continue;
    }
    const state = changeRequestState(item.subjectState, item.reviewRequested);
    if (!state) {
      continue;
    }
    seen.add(item.id);
    requests.push({
      id: item.id,
      ticketId,
      repo: item.repository,
      number: pullRequestNumber(item),
      state,
      updatedAt: item.updatedAt ?? "",
    });
  }
  return requests;
}

function readLastVisitAt(scope: "project" | "all"): string {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      const raw = window.localStorage.getItem(`t3team:my-work-digest:last-visit:${scope}`);
      if (raw) {
        return raw;
      }
    } catch {
      // fall through to the default below
    }
  }
  // TODO(digest-data): write-through when the view is actually visited.
  return new Date().toISOString();
}

export function useMyWorkDigestGraph(input: {
  scope: "project" | "all";
  projectId?: string;
  tickets: readonly ProjectTicket[];
  githubActivity?: readonly GitHubWorkActivityItem[];
  sprint?: unknown;
  viewerName?: string;
}): UseMyWorkDigestGraphResult {
  const { scope, projectId, tickets, githubActivity } = input;

  const graph = useMemo<DigestGraph | null>(() => {
    if (tickets.length === 0) {
      return null;
    }

    return {
      scope,
      // TODO(digest-data): resolve the project display name from the project store.
      projects:
        input.scope === "project" && input.projectId ? [{ id: input.projectId, name: "" }] : [],
      viewer: {
        // TODO(digest-data): the viewer's real display name (Atlassian current user).
        name: input.viewerName ?? "",
        // TODO(digest-data): role information is not available client-side yet.
        role: "",
        lastVisitAt: readLastVisitAt(input.scope),
      },
      // TODO(digest-data): active sprint (name/goal/dates) is not fetched by the My Work views.
      ...(input.sprint !== undefined ? { sprint: input.sprint as DigestSprint } : {}),
      tickets,
      // TODO(digest-data): agent claims (active threads working tickets) once the thread store
      // is cheaply reachable from this surface.
      claims: [],
      // TODO(digest-data): open agent questions / decisions.
      decisions: [],
      changeRequests: githubActivityToChangeRequests(input.githubActivity ?? []),
      // TODO(digest-data): recent status transitions (event log) are not available client-side.
      transitions: [],
    };
  }, [scope, projectId, tickets, githubActivity, input.sprint, input.viewerName]);

  if (!graph) {
    return { graph: null, status: "ready" };
  }
  return { graph, status: "ready" as const };
}
