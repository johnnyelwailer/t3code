/**
 * The work-item read tools' queries over the whole-project Jira mirror
 * (`t3team_atlassian_backlog_issues`, kept fresh by the mirror loop). Every query is keyed by the
 * binding's (provider, account, project), so a row of another project is unreachable by
 * construction; filters narrow within that.
 */
import type { WorkItemJqlFilters } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";
import { readT3TeamMirrorSyncStatus } from "./t3team-atlassian-mirrorSyncState.ts";
import type { WorkItemResource } from "./t3team-workItemReadQuery.ts";
import type { JiraMirrorBinding } from "./t3team-workflowSignalWorkItemProjectMirror.ts";

export type MirrorFilters = WorkItemJqlFilters;

const JsonString = Schema.fromJsonString(Schema.Unknown);
const decodeJson = Schema.decodeUnknownSync(JsonString);
const encodeJson = Schema.encodeSync(JsonString);

const lowerList = (values: ReadonlyArray<string> | undefined): ReadonlyArray<string> | undefined =>
  values === undefined || values.length === 0
    ? undefined
    : [...new Set(values.map((value) => value.toLowerCase()))];
const lower = (value: string | undefined): string | null => value?.toLowerCase() ?? null;

const parseRows = (rows: ReadonlyArray<{ readonly resourceJson: string }>) =>
  rows.flatMap((row): WorkItemResource[] => {
    try {
      return [decodeJson(row.resourceJson) as WorkItemResource];
    } catch {
      return [];
    }
  });

/** True once the mirror has caught up at least once; before that its rows are a partial project. */
export const isMirrorReady = (binding: JiraMirrorBinding) =>
  readT3TeamMirrorSyncStatus(binding).pipe(
    Effect.map((status) => status.lastSuccessAtMs !== undefined),
  );

export const searchMirror = Effect.fn("t3team.workItemRead.mirrorSearch")(function* (
  binding: JiraMirrorBinding,
  filters: MirrorFilters,
  limit: number,
  offset: number,
) {
  yield* ensureBacklogCacheTables();
  const sql = yield* SqlClient.SqlClient;
  const statuses = lowerList(filters.status);
  const labels = lowerList(filters.labels);
  const statusJson = statuses === undefined ? null : encodeJson(statuses);
  const labelsJson = labels === undefined ? null : encodeJson(labels);
  const assignee = lower(filters.assignee);
  const rows = yield* sql<{ readonly resourceJson: string }>`
    SELECT resource_json AS "resourceJson" FROM t3team_atlassian_backlog_issues
    WHERE provider = ${binding.provider} AND account_id = ${binding.accountId}
      AND external_project_id = ${binding.externalProjectId} AND issue_key IS NOT NULL
      AND (${statusJson} IS NULL OR lower(json_extract(resource_json, '$.status'))
        IN (SELECT value FROM json_each(${statusJson})))
      AND (${assignee} IS NULL
        OR (${assignee} = 'unassigned' AND json_extract(resource_json, '$.assignee') IS NULL)
        OR lower(json_extract(resource_json, '$.assignee')) = ${assignee}
        OR lower(assignee_account_id) = ${assignee})
      AND (${lower(filters.type)} IS NULL
        OR lower(json_extract(resource_json, '$.type')) = ${lower(filters.type)})
      AND (${lower(filters.sprint)} IS NULL
        OR lower(json_extract(resource_json, '$.sprintName')) = ${lower(filters.sprint)}
        OR lower(json_extract(resource_json, '$.sprintId')) = ${lower(filters.sprint)})
      AND (${labelsJson} IS NULL OR (
        SELECT count(DISTINCT lower(label.value))
        FROM json_each(COALESCE(json_extract(resource_json, '$.labels'), '[]')) AS label
        WHERE lower(label.value) IN (SELECT value FROM json_each(${labelsJson}))
      ) = ${labels?.length ?? 0})
      AND (${lower(filters.text)} IS NULL OR instr(lower(
        COALESCE(issue_key, '') || ' ' || COALESCE(json_extract(resource_json, '$.title'), '')
        || ' ' || COALESCE(json_extract(resource_json, '$.description'), '')
      ), ${lower(filters.text)}) > 0)
    ORDER BY updated_at DESC, issue_key ASC
    LIMIT ${limit} OFFSET ${offset}`;
  return parseRows(rows);
});

export const getMirrorItem = Effect.fn("t3team.workItemRead.mirrorGet")(function* (
  binding: JiraMirrorBinding,
  issueKey: string,
) {
  yield* ensureBacklogCacheTables();
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly resourceJson: string }>`
    SELECT resource_json AS "resourceJson" FROM t3team_atlassian_backlog_issues
    WHERE provider = ${binding.provider} AND account_id = ${binding.accountId}
      AND external_project_id = ${binding.externalProjectId} AND issue_key = ${issueKey}
    LIMIT 1`;
  return parseRows(rows)[0] ?? null;
});

export const listMirrorChildren = Effect.fn("t3team.workItemRead.mirrorChildren")(function* (
  binding: JiraMirrorBinding,
  parentKey: string,
  limit: number,
) {
  yield* ensureBacklogCacheTables();
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly resourceJson: string }>`
    SELECT resource_json AS "resourceJson" FROM t3team_atlassian_backlog_issues
    WHERE provider = ${binding.provider} AND account_id = ${binding.accountId}
      AND external_project_id = ${binding.externalProjectId}
      AND json_extract(resource_json, '$.parentId') = ${parentKey}
    ORDER BY issue_key ASC LIMIT ${limit}`;
  return parseRows(rows);
});
