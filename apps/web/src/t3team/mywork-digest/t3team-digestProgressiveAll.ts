/**
 * The "All projects" digest, painted project by project.
 *
 * The all-scope round answers for every bound project at once, so it is only as fast as the slowest
 * project (a mirror still catching up, a cold PR read) and on a busy machine it could sit past its
 * timeout, leaving the view on a loading skeleton while one project's tickets were long in the local
 * mirror. While no all-scope answer has landed, the hook also asks for each project on its own, one
 * at a time, and paints whatever has already landed: the projects that are synced appear at once,
 * and the header says which ones are still on their way. The all-scope round stays the authority:
 * as soon as it lands it replaces the partial graph.
 *
 * Each single-project read is sent as scope "all" with one entry, so the server treats it like the
 * All projects view (its mirror kick waits its turn in the background lane) and it never records a
 * visit receipt for the per-project digest.
 */
import type {
  MyWorkDigestPayload,
  MyWorkDigestPollFn,
  MyWorkDigestProjectInput,
} from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

/** One project's answer, with the entry it was asked for (the graph mapper joins by position). */
export type ProgressiveDigestPart = {
  readonly entry: MyWorkDigestProjectInput;
  readonly payload: MyWorkDigestPayload;
};

export function progressiveEntryKey(entry: MyWorkDigestProjectInput): string {
  return `${entry.account.id}:${entry.externalProjectId}:${entry.appProjectId ?? ""}`;
}

/**
 * Projects with work on screen last time go first (most tickets first), so the project the viewer
 * actually lives in lands before the empty ones; ties keep the scope's own order.
 */
export function orderProgressiveEntries(
  entries: ReadonlyArray<MyWorkDigestProjectInput>,
  previous: DigestGraph | null,
): MyWorkDigestProjectInput[] {
  const ticketsByProject = new Map<string, number>();
  for (const ticket of previous?.tickets ?? []) {
    ticketsByProject.set(ticket.projectId, (ticketsByProject.get(ticket.projectId) ?? 0) + 1);
  }
  return entries
    .map((entry, index) => ({
      entry,
      index,
      tickets: ticketsByProject.get(entry.appProjectId ?? "") ?? 0,
    }))
    .sort((a, b) => b.tickets - a.tickets || a.index - b.index)
    .map((item) => item.entry);
}

/** The landed parts as one all-scope payload, with entries aligned to its projects. */
export function mergeProgressiveParts(parts: ReadonlyArray<ProgressiveDigestPart>): {
  readonly payload: MyWorkDigestPayload;
  readonly entries: ReadonlyArray<MyWorkDigestProjectInput>;
} {
  const projects: Array<MyWorkDigestPayload["projects"][number]> = [];
  const entries: MyWorkDigestProjectInput[] = [];
  for (const part of parts) {
    // The server drops a project it could not load; only a present one keeps the join aligned.
    const data = part.payload.projects[0];
    if (data === undefined) continue;
    projects.push(data);
    entries.push(part.entry);
  }
  const named = parts.find((part) => part.payload.viewer?.name);
  const unresolved = parts.some((part) => part.payload.viewer?.unresolved === true);
  const lastVisitAt = parts
    .map((part) => part.payload.viewer?.lastVisitAt)
    .filter((at): at is string => at !== undefined)
    .toSorted()[0];
  return {
    payload: {
      scope: "all",
      projects,
      viewer: {
        ...(named?.payload.viewer?.name !== undefined ? { name: named.payload.viewer.name } : {}),
        ...(unresolved ? { unresolved: true as const } : {}),
        ...(lastVisitAt !== undefined ? { lastVisitAt } : {}),
      },
      ...(parts.some((part) => part.payload.changeRequestsPending === true)
        ? { changeRequestsPending: true as const }
        : {}),
    },
    entries,
  };
}

/**
 * Ask for each project in turn (never in parallel: the point is to stay light on a busy server),
 * handing every answer to `onPart` together with the projects still to come. Stops as soon as
 * `isCancelled` says the all-scope round landed or the scope moved on. A project that fails is
 * skipped: the all-scope round, still polling, is what reports errors.
 */
export async function runProgressiveAllRounds(input: {
  readonly entries: ReadonlyArray<MyWorkDigestProjectInput>;
  readonly pollFn: MyWorkDigestPollFn;
  readonly viewerName: string;
  readonly timeZone: string;
  readonly isCancelled: () => boolean;
  readonly onPart: (
    part: ProgressiveDigestPart,
    remaining: ReadonlyArray<MyWorkDigestProjectInput>,
  ) => void;
  readonly onSkip?: (
    entry: MyWorkDigestProjectInput,
    remaining: ReadonlyArray<MyWorkDigestProjectInput>,
  ) => void;
}): Promise<void> {
  for (const [index, entry] of input.entries.entries()) {
    if (input.isCancelled()) return;
    const remaining = input.entries.slice(index + 1);
    try {
      const result = await input.pollFn({
        scope: "all",
        projects: [entry],
        viewer: { name: input.viewerName },
        timeZone: input.timeZone,
      });
      if (input.isCancelled()) return;
      if (result.unchanged) {
        input.onSkip?.(entry, remaining);
        continue;
      }
      input.onPart({ entry, payload: result.value }, remaining);
    } catch {
      if (input.isCancelled()) return;
      input.onSkip?.(entry, remaining);
    }
  }
}
