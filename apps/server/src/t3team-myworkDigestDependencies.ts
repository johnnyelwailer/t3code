/**
 * Who the viewer's work hangs together with, off the Jira mirror: the people waiting on one of
 * their tickets (it `blocks` theirs), the people they wait on (theirs `blocks` the viewer's), and
 * the colleagues on the same story (the backend half of a frontend task). Each comes with the
 * other ticket's assignee and status, so the digest can say WHO, not just which key.
 *
 * The mirror stores only outward links (`{ outward: "blocks", key }`), so "waits on" is the
 * reverse lookup over every issue in the project.
 */

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  parseJson,
  type BacklogResourceRef,
  type T3TeamBacklogCacheIdentity,
} from "./t3team-atlassian-backlog-cacheShared.ts";

export type T3TeamDigestDependency = {
  /** The viewer's ticket this is about. */
  readonly ticketKey: string;
  readonly relation: "waits-on-you" | "you-wait-on" | "same-story";
  readonly other: {
    readonly key: string;
    readonly title: string;
    readonly status: string;
    readonly assignee?: string;
    readonly url?: string;
  };
};

type MirrorIssue = BacklogResourceRef & {
  readonly displayId?: string;
  readonly parentId?: string;
  readonly status?: string;
  readonly assignee?: string;
  readonly url?: string;
  readonly links?: ReadonlyArray<{ readonly outward: string; readonly key: string }>;
};

const SIBLING_LIMIT = 60;
const isBlocks = (outward: string) => /\bblocks\b/i.test(outward);

function toOther(issue: MirrorIssue): T3TeamDigestDependency["other"] {
  return {
    key: issue.displayId ?? issue.id,
    title: issue.title ?? "",
    status: issue.status ?? "",
    ...(issue.assignee ? { assignee: issue.assignee } : {}),
    ...(issue.url ? { url: issue.url } : {}),
  };
}

export function readDigestDependencies(input: {
  readonly identity: T3TeamBacklogCacheIdentity;
  /** The viewer's own tickets (not their parents). */
  readonly assigned: ReadonlyArray<BacklogResourceRef>;
}) {
  return Effect.gen(function* () {
    const mine = input.assigned as ReadonlyArray<MirrorIssue>;
    const myKeys = mine.map((issue) => issue.displayId ?? issue.id).filter((key) => key !== "");
    if (myKeys.length === 0) return [];
    const sql = yield* SqlClient.SqlClient;
    const { provider, accountId, externalProjectId } = input.identity;
    const scope = sql`provider = ${provider} AND account_id = ${accountId} AND external_project_id = ${externalProjectId}`;
    const read = (rows: ReadonlyArray<{ readonly json: string }>) =>
      rows.flatMap((row) => {
        const issue = parseJson<MirrorIssue>(row.json);
        return issue ? [issue] : [];
      });

    const outward = mine.flatMap((issue) =>
      (issue.links ?? [])
        .filter((link) => isBlocks(link.outward))
        .map((link) => ({ from: issue, key: link.key })),
    );
    const blockedKeys = [...new Set(outward.map((link) => link.key))];
    const blocked =
      blockedKeys.length === 0
        ? []
        : read(
            yield* sql<{ readonly json: string }>`
            SELECT resource_json AS json FROM t3team_atlassian_backlog_issues
            WHERE ${scope} AND ${sql.in("issue_key", blockedKeys)}`,
          );
    const blockers = read(
      yield* sql<{ readonly json: string }>`
      SELECT DISTINCT issues.resource_json AS json
      FROM t3team_atlassian_backlog_issues AS issues,
        json_each(json_extract(issues.resource_json, '$.links')) AS link
      WHERE ${scope}
        AND json_extract(link.value, '$.key') IN ${sql.in(myKeys)}
        AND lower(json_extract(link.value, '$.outward')) LIKE '%blocks%'`,
    );
    const parentIds = [
      ...new Set(mine.flatMap((issue) => (issue.parentId ? [issue.parentId] : []))),
    ];
    const siblings =
      parentIds.length === 0
        ? []
        : read(
            yield* sql<{ readonly json: string }>`
            SELECT resource_json AS json FROM t3team_atlassian_backlog_issues
            WHERE ${scope} AND json_extract(resource_json, '$.parentId') IN ${sql.in(parentIds)}
            ORDER BY updated_at DESC LIMIT ${SIBLING_LIMIT}`,
          );

    const byKey = new Map(blocked.map((issue) => [issue.displayId ?? issue.id, issue]));
    const mineKeys = new Set(myKeys);
    const result: T3TeamDigestDependency[] = [];
    for (const link of outward) {
      const other = byKey.get(link.key);
      if (other)
        result.push({
          ticketKey: link.from.displayId ?? link.from.id,
          relation: "waits-on-you",
          other: toOther(other),
        });
    }
    for (const blocker of blockers) {
      for (const link of (blocker.links ?? []).filter(
        (l) => isBlocks(l.outward) && mineKeys.has(l.key),
      )) {
        result.push({ ticketKey: link.key, relation: "you-wait-on", other: toOther(blocker) });
      }
    }
    for (const sibling of siblings) {
      const key = sibling.displayId ?? sibling.id;
      if (mineKeys.has(key)) continue;
      const mineInStory = mine.find((issue) => issue.parentId === sibling.parentId);
      if (mineInStory) {
        result.push({
          ticketKey: mineInStory.displayId ?? mineInStory.id,
          relation: "same-story",
          other: toOther(sibling),
        });
      }
    }
    return result;
  }).pipe(Effect.orElseSucceed((): T3TeamDigestDependency[] => []));
}
