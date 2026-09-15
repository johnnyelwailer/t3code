/**
 * The digest's visit receipt, server-side.
 *
 * "Since last visit" (new items, unhandled review threads) is measured against
 * the viewer's LAST VISIT to a CHANGED digest. That timestamp is state, not a
 * view preference, so it lives in this receipt — the owner storage rule keeps
 * the My Work localStorage for view preferences (lens, density, grouping) only.
 *
 * The receipt is recorded by the poll route only when a round answers CHANGED
 * (the client's known-fingerprint envelope short-circuits the rest), so the
 * stored value stays put while the digest is stable. The poll route computes
 * its fingerprint WITHOUT the receipt and stamps the previous value into the
 * payload only on changed rounds (see `t3team-myworkDigest-routes.ts`).
 */

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { T3TeamBacklogCacheIdentity } from "./t3team-atlassian-backlog-cacheShared.ts";
import type {
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestScope,
} from "./t3team-myworkDigestTypes.ts";

const ensureDigestLastVisitTable = Effect.fn("t3team.digestLastVisit.ensureTable")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_digest_last_visit (
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      last_visit_at_ms INTEGER NOT NULL,
      PRIMARY KEY (provider, account_id, scope)
    )
  `;
});

/**
 * The viewer identity the receipt keys on: the FIRST entry's account. The
 * viewer is a single human; one Atlassian account is the viewer even when the
 * scope spans several app projects of that account.
 */
export function digestLastVisitIdentity(
  input: T3TeamMyWorkDigestInput,
): T3TeamBacklogCacheIdentity | undefined {
  const entry = input.projects[0];
  if (entry === undefined) return undefined;
  return {
    provider: entry.account.provider,
    accountId: entry.account.id,
    externalProjectId: entry.externalProjectId,
  };
}

/** The viewer's last visit for this account + scope, in millis; null when never. */
export function readDigestLastVisit(
  identity: T3TeamBacklogCacheIdentity,
  scope: T3TeamMyWorkDigestScope,
) {
  return Effect.gen(function* () {
    yield* ensureDigestLastVisitTable();
    const sql = yield* SqlClient.SqlClient;
    // The primary key guarantees at most one row; MAX keeps the read one row regardless.
    const rows = yield* sql<{ readonly atMs: number | null }>`
      SELECT MAX(last_visit_at_ms) AS "atMs" FROM t3team_digest_last_visit
      WHERE provider = ${identity.provider}
        AND account_id = ${identity.accountId}
        AND scope = ${scope}
    `;
    const atMs = rows[0]?.atMs ?? null;
    return atMs === null ? null : atMs;
  });
}

/** Record this round's visit (upsert). The caller supplies the clock, matching the backfill cache. */
export function recordDigestLastVisit(
  identity: T3TeamBacklogCacheIdentity,
  scope: T3TeamMyWorkDigestScope,
  atMs: number,
) {
  return Effect.gen(function* () {
    yield* ensureDigestLastVisitTable();
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO t3team_digest_last_visit (provider, account_id, scope, last_visit_at_ms)
      VALUES (${identity.provider}, ${identity.accountId}, ${scope}, ${atMs})
      ON CONFLICT (provider, account_id, scope)
      DO UPDATE SET last_visit_at_ms = excluded.last_visit_at_ms
    `;
  }).pipe(Effect.asVoid);
}
