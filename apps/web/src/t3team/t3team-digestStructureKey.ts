/**
 * What decides how the digest is laid out, as one string: which sections exist, which tickets sit in
 * which, how a story gathers them, and which notices stand above. Two digests with the same key may
 * differ in words and numbers but not in where anything goes, so the motion layer only animates when
 * the key moves.
 */
import type { DigestGraph, ResolvedDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";

export function digestStructureKey(input: {
  readonly plan: ResolvedDigestPlan;
  readonly graph: DigestGraph;
  readonly noticeShown: boolean;
}): string {
  const parentOf = new Map(input.graph.tickets.map((ticket) => [ticket.id, ticket.parentId ?? ""]));
  const sections = input.plan.sections.map((section) => {
    const items = section.items
      .map((item) => `${item.ticketId}^${parentOf.get(item.ticketId) ?? ""}`)
      .join(",");
    return `${section.placement}/${section.id}[${items}|${(section.reviewIds ?? []).join(",")}]`;
  });
  return [
    input.noticeShown ? "notice" : "",
    input.graph.arrangement ? "arranged" : "",
    ...sections,
  ].join(";");
}
