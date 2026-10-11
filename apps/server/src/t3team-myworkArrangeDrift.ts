/**
 * Whether a later digest is different enough to wake the maintain recipe's agent.
 * Stable ticket ids re-resolve on the client; the agent runs only past this threshold.
 */
const DRIFT_FRACTION = 0.25;

export function digestTicketIdSignature(digest: unknown): string {
  const projects =
    digest !== null && typeof digest === "object" && "projects" in digest
      ? (digest as { readonly projects?: unknown }).projects
      : undefined;
  const ids: string[] = [];
  if (!Array.isArray(projects)) return "";
  for (const project of projects) {
    const tickets =
      project !== null && typeof project === "object" && "tickets" in project
        ? (project as { readonly tickets?: unknown }).tickets
        : undefined;
    if (!Array.isArray(tickets)) continue;
    for (const ticket of tickets) {
      const id =
        ticket !== null && typeof ticket === "object" && "id" in ticket
          ? (ticket as { readonly id?: unknown }).id
          : undefined;
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
  }
  ids.sort();
  return ids.join("\n");
}

/** True when the share of ticket ids that survived is below 1 - DRIFT_FRACTION. */
export function digestArrangementDrifted(previous: string, next: string): boolean {
  if (previous === next) return false;
  const before = new Set(previous.split("\n").filter((id) => id.length > 0));
  const after = next.split("\n").filter((id) => id.length > 0);
  let shared = 0;
  for (const id of after) {
    if (before.has(id)) shared += 1;
  }
  const denom = Math.max(before.size, after.length, 1);
  return 1 - shared / denom >= DRIFT_FRACTION;
}
