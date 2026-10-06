import type { DigestGraph, DigestPrPerson } from "~/t3team/t3team-projectMyWorkDigestPlan";

/**
 * One face per person across GitHub and Jira. The same colleague appears as a PR author or
 * reviewer (GitHub avatar, full name where their profile has one) and as a Jira assignee (Jira
 * avatar, which only arrives once the mirror has re-read their tickets). Where the full names are
 * the same — case, accents and spacing aside — whichever side has a face lends it to the other.
 * A bare login ("bm") matches nothing: no guessing from fragments.
 */
function nameKey(name: string | undefined): string | null {
  const key = (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return key.includes(" ") ? key : null;
}

export function withSharedFaces(graph: DigestGraph): DigestGraph {
  const faces = new Map<string, string>();
  const remember = (name: string | undefined, avatarUrl: string | undefined) => {
    const key = nameKey(name);
    if (key && avatarUrl && !faces.has(key)) faces.set(key, avatarUrl);
  };
  const prPeople: DigestPrPerson[] = (graph.reviewRequests ?? []).flatMap((review) => [
    ...(review.author ? [review.author] : []),
    ...(review.reviewers ?? []),
    ...(review.engaged ?? []),
  ]);
  for (const person of prPeople) remember(person.name, person.avatarUrl);
  for (const pr of graph.changeRequests)
    for (const reviewer of pr.reviewers) remember(reviewer.name, reviewer.avatarUrl);
  for (const ticket of graph.tickets) remember(ticket.assignee, ticket.assigneeAvatarUrl);
  for (const dependency of graph.dependencies ?? [])
    remember(dependency.other.assignee, dependency.other.assigneeAvatarUrl);
  if (faces.size === 0) return graph;

  const face = (name: string | undefined) => {
    const key = nameKey(name);
    return key ? faces.get(key) : undefined;
  };
  const lend = <T extends { readonly name: string; readonly avatarUrl?: string }>(person: T): T => {
    const url = person.avatarUrl ?? face(person.name);
    return url && url !== person.avatarUrl ? { ...person, avatarUrl: url } : person;
  };
  return {
    ...graph,
    tickets: graph.tickets.map((ticket) => {
      const url = ticket.assigneeAvatarUrl ?? face(ticket.assignee);
      return url && url !== ticket.assigneeAvatarUrl
        ? { ...ticket, assigneeAvatarUrl: url }
        : ticket;
    }),
    ...(graph.dependencies
      ? {
          dependencies: graph.dependencies.map((dependency) => {
            const { other } = dependency;
            const url = other.assigneeAvatarUrl ?? face(other.assignee);
            return url && url !== other.assigneeAvatarUrl
              ? { ...dependency, other: { ...other, assigneeAvatarUrl: url } }
              : dependency;
          }),
        }
      : {}),
    ...(graph.reviewRequests
      ? {
          reviewRequests: graph.reviewRequests.map((review) => ({
            ...review,
            ...(review.author ? { author: lend(review.author) } : {}),
            ...(review.reviewers ? { reviewers: review.reviewers.map(lend) } : {}),
            ...(review.engaged ? { engaged: review.engaged.map(lend) } : {}),
          })),
        }
      : {}),
    changeRequests: graph.changeRequests.map((pr) => ({
      ...pr,
      reviewers: pr.reviewers.map(lend),
    })),
  };
}
