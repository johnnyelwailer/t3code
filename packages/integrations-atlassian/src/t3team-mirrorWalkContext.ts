/**
 * What a whole-project mirror walk needs before every page: the project (id to
 * key) and the estimate/sprint custom fields. A 100-issue page used to re-fetch
 * all of it (the full project list plus the full field list, twice), so a page
 * cost four Jira calls instead of one. The context is cached per client for a
 * short TTL, and a walk's pages share it.
 */
import type { JiraApiClient } from "./jiraApi.ts";
import {
  findJiraEstimateField,
  findJiraSprintField,
  type JiraEstimateField,
  type JiraSprintField,
} from "./planning.ts";

export type MirrorWalkContext = {
  readonly project: { readonly id: string; readonly key: string } | null;
  readonly estimateField: JiraEstimateField | null;
  readonly sprintField: JiraSprintField | null;
};

const mirrorWalkContextTtlMs = 5 * 60_000;

type CachedContext = { readonly expiresAtMs: number; readonly context: MirrorWalkContext };

const cachedContextByClient = new WeakMap<JiraApiClient, Map<string, CachedContext>>();

async function fetchMirrorWalkContext(
  client: JiraApiClient,
  projectId: string,
): Promise<{ context: MirrorWalkContext; complete: boolean }> {
  const [projects, fields] = await Promise.all([
    client.searchProjects(),
    client.listFields().then(
      (list) => list,
      () => undefined,
    ),
  ]);
  const match = projects.values.find((candidate) => candidate.id === projectId);
  return {
    context: {
      project: match ? { id: match.id, key: match.key } : null,
      estimateField: fields ? findJiraEstimateField(fields) : null,
      sprintField: fields ? findJiraSprintField(fields) : null,
    },
    complete: match !== undefined && fields !== undefined,
  };
}

/**
 * The walk context for `projectId`. Only a complete answer (project found, field
 * list fetched) is cached, so a missing project or a failed field lookup is
 * retried by the next page rather than remembered.
 */
export async function resolveMirrorWalkContext(
  client: JiraApiClient,
  projectId: string,
): Promise<MirrorWalkContext> {
  const nowMs = performance.now();
  const cache = cachedContextByClient.get(client) ?? new Map<string, CachedContext>();
  cachedContextByClient.set(client, cache);
  const cached = cache.get(projectId);
  if (cached && cached.expiresAtMs > nowMs) return cached.context;

  const { context, complete } = await fetchMirrorWalkContext(client, projectId);
  if (complete) cache.set(projectId, { expiresAtMs: nowMs + mirrorWalkContextTtlMs, context });
  return context;
}
