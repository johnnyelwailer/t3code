/**
 * The digest graph's PR and people joins, split from the mapper (`t3team-digestGraphMappers.ts`):
 * PRs onto the tickets they name, the reviews the viewer owes, and who the viewer's tickets hang
 * together with. Every join resolves keys through the mapper's per-project ticket index.
 */

import type { MyWorkDigestPayload } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type {
  DigestChangeRequest,
  DigestDependency,
  DigestReviewRequest,
} from "~/t3team/t3team-projectMyWorkDigestTypes";

import { countUnhandledThreads, type DigestTicketRefLike } from "./t3team-digestGraphHelpers";

type Projects = MyWorkDigestPayload["projects"];
type Resolve = (position: number, ref: DigestTicketRefLike) => string;

/** Each project's PRs on the tickets they name; a PR naming no held ticket stays off the rows. */
export function digestTicketChangeRequests(
  projects: Projects,
  resolveTicketId: Resolve,
  projectIdAt: (position: number) => string,
  lastVisitMs: number,
): DigestChangeRequest[] {
  return projects.flatMap((data, position) =>
    data.changeRequests.flatMap((pr): DigestChangeRequest[] => {
      if (pr.workItemKey === undefined) return [];
      const ticketId = resolveTicketId(position, { issueKey: pr.workItemKey });
      if (ticketId === "") return [];
      return [
        {
          id: pr.id,
          ticketId,
          ...(pr.host !== undefined ? { host: pr.host } : {}),
          repo: pr.repo,
          number: pr.number,
          ...(pr.title !== undefined ? { title: pr.title } : {}),
          projectId: projectIdAt(position),
          state: pr.state,
          updatedAt: pr.updatedAt,
          // TODO(digest-data): per-reviewer verdicts have no host source yet; PR-level only.
          reviewers: pr.reviewers ?? [],
          ...(pr.unhandledReviewThreads !== undefined
            ? { unhandledComments: countUnhandledThreads(pr.unhandledReviewThreads, lastVisitMs) }
            : {}),
        },
      ];
    }),
  );
}

/**
 * Other people's PRs waiting for the viewer's review, once each across projects: the review lane's
 * rows. A PR the viewer wrote is theirs to move and stays a chip on its ticket instead.
 */
export function digestReviewRequests(
  projects: Projects,
  resolveTicketId: Resolve,
  projectIdAt: (position: number) => string,
): DigestReviewRequest[] {
  const byId = new Map<string, DigestReviewRequest>();
  projects.forEach((data, position) => {
    for (const pr of data.changeRequests) {
      if (pr.viewerReviewRequested !== true || pr.viewerAuthored === true) continue;
      const ticketId =
        pr.workItemKey !== undefined ? resolveTicketId(position, { issueKey: pr.workItemKey }) : "";
      // One PR reaches every project whose key it names; keep the copy that found its ticket.
      if (byId.has(pr.id) && (ticketId === "" || byId.get(pr.id)?.ticketId !== undefined)) continue;
      byId.set(pr.id, {
        id: pr.id,
        projectId: projectIdAt(position),
        ...(pr.host !== undefined ? { host: pr.host } : {}),
        repo: pr.repo,
        number: pr.number,
        title: pr.title ?? `${pr.repo}#${pr.number}`,
        updatedAt: pr.updatedAt,
        ...(pr.author !== undefined
          ? { author: pr.author }
          : pr.authorLogin !== undefined
            ? { author: { name: pr.authorLogin, login: pr.authorLogin } }
            : {}),
        ...(pr.reviewers !== undefined ? { reviewers: pr.reviewers } : {}),
        ...(pr.engaged !== undefined ? { engaged: pr.engaged } : {}),
        ...(pr.additions !== undefined ? { additions: pr.additions } : {}),
        ...(pr.deletions !== undefined ? { deletions: pr.deletions } : {}),
        ...(pr.workItemKey !== undefined ? { workItemKey: pr.workItemKey } : {}),
        ...(ticketId !== "" ? { ticketId } : {}),
      });
    }
  });
  // Nobody on it yet comes first — someone else already reviewing makes a PR less urgent for the
  // viewer — then not yet read (unknown), then already covered; within each, the longest waiting.
  const coverage = (review: DigestReviewRequest) =>
    review.engaged === undefined ? 1 : review.engaged.length > 0 ? 2 : 0;
  return [...byId.values()].toSorted(
    (a, b) => coverage(a) - coverage(b) || Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
  );
}

/** Who each of the viewer's tickets hangs together with, on the ticket ids the rows use. */
export function digestDependencies(
  projects: Projects,
  resolveTicketId: Resolve,
): DigestDependency[] {
  return projects.flatMap((data, position) =>
    (data.dependencies ?? []).flatMap((dependency): DigestDependency[] => {
      const ticketId = resolveTicketId(position, { issueKey: dependency.ticketKey });
      return ticketId === ""
        ? []
        : [{ ticketId, relation: dependency.relation, other: dependency.other }];
    }),
  );
}
