/**
 * The digest's change-request read: the pull request listing straight off the
 * shared TTL cache (zero host calls while the cache is warm), plus a bounded
 * enrichment of the freshest OPEN PRs — detail + activity through the same
 * cached, single-flight service reads the main PR page uses. Merged/closed
 * rows are never enriched: their chips show no faces or comments. A host that
 * cannot be read this round degrades — the section stays empty and says so in
 * `note` — rather than failing the whole digest.
 */

import { ProjectId, type PullRequestListEntry } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { PullRequestService } from "./pullRequest/PullRequestService.ts";
import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";
import {
  digestEnrichmentFields,
  enrichPr,
  toDigestPerson,
  type PrEnrichment,
} from "./t3team-myworkDigestPrEnrich.ts";
import {
  isRateLimitedFailure,
  RATE_LIMITED_CHANGE_REQUEST_NOTE,
} from "./t3team-myworkDigestRateLimited.ts";

export {
  digestEnrichmentFields,
  enrichPr,
  type PrEnrichment,
} from "./t3team-myworkDigestPrEnrich.ts";

const DIGEST_PR_LIMIT = 50;
/**
 * How many open PRs get the detail + activity reads per round. The digest
 * polls on the order of a minute and the detail/activity cache is 15s, so a
 * cold round costs two host reads per enriched PR; eight is roughly how many
 * chips a single screen shows before the section scrolls.
 */
const DIGEST_PR_ENRICH_LIMIT = 8;

export type PrReadResult = {
  readonly entries: readonly PullRequestListEntry[];
  readonly note?: string;
  /** The entries are the last good listing, served while the host rate-limits reads. */
  readonly stale?: boolean;
  readonly enrichments?: Record<string, PrEnrichment>;
};

/** `host:repo#number` — the digest's own PR id, the enrichment key. */
function digestPrKey(entry: {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
}): string {
  return `${entry.host}:${entry.repository}#${entry.number}`;
}

/**
 * One open PR's enrichment, through the shared cached reads. Any per-PR
 * failure (a repo the CLI cannot see, a host blip) skips that PR's enrichment
 * instead of sinking the round — the chip simply loses its faces.
 */
function enrichOnePr(service: PullRequestService["Service"], entry: PullRequestListEntry) {
  return enrichPr(service, {
    projectId: entry.projectId,
    repository: entry.repository,
    number: entry.number,
  });
}

/** The digest's PR rows: the cached listing shaped for the joiner, enrichment merged in. */
export function toDigestPrEntries(
  read: PrReadResult | undefined,
): T3TeamDigestProjectSource["prEntries"] {
  const enrichments = read?.enrichments ?? {};
  return (read?.entries ?? []).map((entry) => {
    const enrichment = enrichments[digestPrKey(entry)];
    return {
      host: entry.host,
      repository: entry.repository,
      number: entry.number,
      title: entry.title,
      headBranch: entry.headBranch,
      state: entry.state,
      isDraft: entry.isDraft,
      updatedAt: entry.updatedAt,
      viewerReviewRequested: entry.viewerReviewRequested,
      ...(entry.reviewDecision !== undefined ? { reviewDecision: entry.reviewDecision } : {}),
      ...(entry.checksState !== undefined ? { checksState: entry.checksState } : {}),
      ...(entry.author?.login ? { authorLogin: entry.author.login } : {}),
      ...(entry.author ? { author: toDigestPerson(entry.author) } : {}),
      ...(enrichment !== undefined ? digestEnrichmentFields(enrichment) : {}),
    };
  });
}

// The last listing each project read successfully. A listing the host's rate limit refused serves
// it instead of an empty one, so the digest keeps its PR chips (drafts included) and says so in
// `note`, rather than every card dropping its PRs until the quota resets. Any other failure
// (signed out, revoked token, lost access) does not fall back.
const lastGoodListing = new Map<string, readonly PullRequestListEntry[]>();

export function loadPrEntries(
  appProjectId: string | undefined,
): Effect.Effect<PrReadResult | undefined, never, PullRequestService> {
  return Effect.gen(function* () {
    if (appProjectId === undefined) return undefined;
    const service = yield* PullRequestService;

    let entries: readonly PullRequestListEntry[] = [];
    let note: string | undefined;
    let stale = false;
    const listRead = yield* service
      .list({ state: "all", projectId: ProjectId.make(appProjectId), limit: DIGEST_PR_LIMIT })
      .pipe(Effect.result);
    if (listRead._tag === "Success") {
      entries = listRead.success.entries;
      lastGoodListing.set(appProjectId, entries);
    } else {
      const lastGood = isRateLimitedFailure(listRead.failure)
        ? lastGoodListing.get(appProjectId)
        : undefined;
      entries = lastGood ?? [];
      stale = lastGood !== undefined;
      note =
        lastGood !== undefined
          ? RATE_LIMITED_CHANGE_REQUEST_NOTE
          : listRead.failure instanceof Error
            ? listRead.failure.message
            : "Change requests unavailable.";
    }
    if (entries.length === 0) return { entries, ...(note !== undefined ? { note } : {}) };
    const staleField = stale ? { stale: true } : {};

    // Enrich only the freshest OPEN rows: those are the chips that show
    // faces and comment counts. Bounded and parallel through the service's
    // own cache — never an unbounded fan-out, never merged-PR reads.
    const openEntries = entries
      .filter((entry) => entry.state === "open")
      .toSorted((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, DIGEST_PR_ENRICH_LIMIT);
    const enrichments: Record<string, PrEnrichment> = {};
    const results = yield* Effect.all(
      openEntries.map((entry) => enrichOnePr(service, entry)),
      { concurrency: 4 },
    );
    openEntries.forEach((entry, index) => {
      const enrichment = results[index];
      if (enrichment !== undefined) enrichments[digestPrKey(entry)] = enrichment;
    });
    return {
      entries,
      ...(note !== undefined ? { note } : {}),
      ...staleField,
      ...(Object.keys(enrichments).length > 0 ? { enrichments } : {}),
    };
  });
}
