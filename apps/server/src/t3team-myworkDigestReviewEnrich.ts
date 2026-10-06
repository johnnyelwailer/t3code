/**
 * Faces, coverage and size for the open PRs the host-wide search found: requested reviewers,
 * everyone who already commented, the change size. The search carries none of that, so these PRs
 * are read once more through the shared cached PR detail/activity (bounded, stale-while-revalidate
 * like every digest PR read). Reviews waiting on the viewer come first — a PR nobody has looked at
 * yet is the one to take first — then the viewer's own, whose chips show who reviews them.
 */

import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { PullRequestService } from "./pullRequest/PullRequestService.ts";
import { digestEnrichmentFields, enrichPr } from "./t3team-myworkDigestPr.ts";
import { readCached } from "./t3team-myworkDigestPrCache.ts";
import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";

type DigestPrEntry = T3TeamDigestProjectSource["prEntries"][number];

const ENRICH_LIMIT = 16;

const needsEnrichment = (entry: DigestPrEntry) =>
  entry.state === "open" && entry.engaged === undefined;
const isReviewForViewer = (entry: DigestPrEntry) =>
  entry.viewerReviewRequested && entry.viewerAuthored !== true;

export function enrichDigestReviewEntries(
  entries: ReadonlyArray<DigestPrEntry>,
  appProjectId: string | undefined,
) {
  const todo = entries
    .filter(needsEnrichment)
    .toSorted((a, b) => Number(isReviewForViewer(b)) - Number(isReviewForViewer(a)))
    .slice(0, ENRICH_LIMIT);
  if (appProjectId === undefined || todo.length === 0) {
    return Effect.succeed({ entries: [...entries], pending: false });
  }
  const key = `reviews:${appProjectId}:${todo.map((e) => `${e.host}:${e.repository}#${e.number}`).join(",")}`;
  const load = Effect.gen(function* () {
    const service = yield* PullRequestService;
    const enriched = yield* Effect.all(
      todo.map((entry) =>
        enrichPr(service, {
          projectId: ProjectId.make(appProjectId),
          host: entry.host,
          repository: entry.repository,
          number: entry.number,
        }),
      ),
      { concurrency: 4 },
    );
    return new Map(
      todo.flatMap((entry, index) => {
        const enrichment = enriched[index];
        return enrichment
          ? [[`${entry.host}:${entry.repository}#${entry.number}`, enrichment] as const]
          : [];
      }),
    );
  });
  return readCached(key, load, new Map()).pipe(
    Effect.map(({ read, pending }) => ({
      pending,
      entries: entries.map((entry) => {
        const enrichment = read.get(`${entry.host}:${entry.repository}#${entry.number}`);
        return enrichment ? { ...entry, ...digestEnrichmentFields(enrichment) } : entry;
      }),
    })),
  );
}
