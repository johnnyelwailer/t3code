/**
 * The digest graph's "yesterday" join, split from the mapper (`t3team-digestGraphMappers.ts`): the
 * PRs the viewer merged and the tickets of theirs that moved, on the ticket ids the rows use. A PR
 * naming two projects' keys reaches both sections; it is listed once, on the copy that found its
 * ticket.
 */

import type { MyWorkDigestPayload } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type {
  DigestYesterday,
  DigestYesterdayMerged,
  DigestYesterdayMoved,
} from "~/t3team/t3team-projectMyWorkDigestTypes";

import type { DigestTicketRefLike } from "./t3team-digestGraphHelpers";

type Resolve = (position: number, ref: DigestTicketRefLike) => string;

const newestFirst = (left: string, right: string) => Date.parse(right) - Date.parse(left);

/** `undefined` when no project had anything for the previous working day. */
export function digestYesterday(
  projects: MyWorkDigestPayload["projects"],
  resolveTicketId: Resolve,
  projectIdAt: (position: number) => string,
): DigestYesterday | undefined {
  const merged = new Map<string, DigestYesterdayMerged>();
  const moved = new Map<string, DigestYesterdayMoved>();
  projects.forEach((data, position) => {
    for (const pr of data.yesterday?.merged ?? []) {
      const ticketId =
        pr.workItemKey !== undefined ? resolveTicketId(position, { issueKey: pr.workItemKey }) : "";
      if (merged.has(pr.id) && (ticketId === "" || merged.get(pr.id)?.ticketId !== undefined)) {
        continue;
      }
      merged.set(pr.id, {
        id: pr.id,
        projectId: projectIdAt(position),
        host: pr.host,
        repo: pr.repo,
        number: pr.number,
        title: pr.title,
        mergedAt: pr.mergedAt,
        ...(pr.workItemKey !== undefined ? { workItemKey: pr.workItemKey } : {}),
        ...(ticketId !== "" ? { ticketId } : {}),
      });
    }
    for (const move of data.yesterday?.moved ?? []) {
      const ticketId = resolveTicketId(position, move.ticketRef);
      if (ticketId === "" || moved.has(ticketId)) continue;
      moved.set(ticketId, {
        ticketId,
        ...(move.from !== undefined ? { from: move.from } : {}),
        ...(move.to !== undefined ? { to: move.to } : {}),
        at: move.at,
      });
    }
  });
  if (merged.size === 0 && moved.size === 0) return undefined;
  return {
    merged: [...merged.values()].toSorted((a, b) => newestFirst(a.mergedAt, b.mergedAt)),
    moved: [...moved.values()].toSorted((a, b) => newestFirst(a.at, b.at)),
  };
}
