/**
 * The pure half of the `scm.project.items` source: per host, what the last poll remembered (the
 * cursor), what this poll's `updated:>=` search returned, and which events the difference is.
 *
 *   • A host with no cursor — missing, unreadable, or new to the project — is a BASELINE: the poll
 *     starts watching from now and emits nothing, so a lost cursor never replays a backlog.
 *   • An item is emitted only when its `updatedAt` moved past what the cursor remembers, so the
 *     overlapping search window never emits the same change twice.
 *   • A host whose search failed or was cut off keeps its window start: the next poll re-reads the
 *     same window (the memory dedupes what this one already emitted).
 *   • Remembered items older than the window are forgotten; they can only come back by changing.
 */

import type { ScmProjectItemPayloadType } from "@t3team/sdk";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { GitHubSearchItem } from "./t3team-githubViewerSearch.ts";
import { searchHitMergedAt, searchHitRepository } from "./t3team-githubViewerSearch.ts";

/** Re-read this much before the last poll, so an item updated during a poll is never missed. */
export const PROJECT_POLL_OVERLAP_MS = 120_000;

type ItemState = ScmProjectItemPayloadType["state"];
type Reason = "opened" | "updated" | "closed" | "reopened" | "merged";

const HostCursor = Schema.Struct({
  /** When the last complete poll of this host started; the next search reads from here. */
  since: Schema.String,
  /** When this host started being watched: an item created after it is `opened`. */
  watchingSince: Schema.String,
  items: Schema.Record(
    Schema.String,
    Schema.Struct({
      updatedAt: Schema.String,
      state: Schema.Literals(["open", "closed", "merged"]),
    }),
  ),
});
type HostCursor = typeof HostCursor.Type;

const ProjectItemsCursor = Schema.Struct({
  v: Schema.Literal(1),
  hosts: Schema.Record(Schema.String, HostCursor),
});
export type ProjectItemsCursor = typeof ProjectItemsCursor.Type;

const decodeCursor = Schema.decodeUnknownOption(Schema.fromJsonString(ProjectItemsCursor));
const encodeCursor = Schema.encodeSync(Schema.fromJsonString(ProjectItemsCursor));

/** One host's search answer this poll; `complete` is false when it failed or hit the limit. */
export interface ProjectHostRead {
  readonly host: string;
  readonly items: ReadonlyArray<GitHubSearchItem>;
  readonly complete: boolean;
}

export interface ProjectItemEvent {
  readonly key: string;
  readonly payload: { readonly item: ScmProjectItemPayloadType; readonly reason: Reason };
}

const beforeOverlap = (iso: string): string =>
  DateTime.formatIso(
    DateTime.subtract(DateTime.makeUnsafe(iso), { milliseconds: PROJECT_POLL_OVERLAP_MS }),
  );

/** A cursor this code can use, or null — which the poll treats as a baseline for every host. */
export function parseProjectItemsCursor(raw: string | null): ProjectItemsCursor | null {
  return raw === null ? null : Option.getOrNull(decodeCursor(raw));
}

export const serializeProjectItemsCursor = (cursor: ProjectItemsCursor): string =>
  encodeCursor(cursor);

/** The search window a host's next read starts at, or null when the host has to baseline. */
export function projectSearchSince(cursor: ProjectItemsCursor | null, host: string): string | null {
  const since = cursor?.hosts[host]?.since;
  return since === undefined ? null : beforeOverlap(since);
}

const stateOf = (hit: GitHubSearchItem): ItemState =>
  hit.pull_request != null && searchHitMergedAt(hit) !== null && hit.state === "closed"
    ? "merged"
    : hit.state === "closed"
      ? "closed"
      : "open";

function reasonFor(
  before: HostCursor["items"][string] | undefined,
  state: ItemState,
  createdAt: string | undefined,
  watchingSince: string,
): Reason {
  if (before === undefined) {
    if (state !== "open") return state;
    return createdAt !== undefined && createdAt >= watchingSince ? "opened" : "updated";
  }
  if (before.state === state) return "updated";
  return state === "open" ? "reopened" : state;
}

export function toProjectItem(host: string, hit: GitHubSearchItem): ScmProjectItemPayloadType {
  const repository = searchHitRepository(hit.repository_url);
  const kind = hit.pull_request != null ? "change-request" : "issue";
  return {
    kind,
    provider: "github",
    host,
    repository,
    number: hit.number,
    title: hit.title,
    url:
      hit.html_url ??
      `https://${host}/${repository}/${kind === "issue" ? "issues" : "pull"}/${hit.number}`,
    state: stateOf(hit),
    ...(hit.draft === undefined ? {} : { isDraft: hit.draft }),
    ...(hit.user?.login ? { author: hit.user.login } : {}),
    ...(hit.author_association ? { authorAssociation: hit.author_association } : {}),
    labels: (hit.labels ?? []).flatMap((label) => (label.name ? [label.name] : [])),
    ...(hit.created_at ? { createdAt: hit.created_at } : {}),
    updatedAt: hit.updated_at,
  };
}

/** Fold one poll into the next cursor and the events it earned. `nowIso`: when the poll started. */
export function settleProjectPoll(
  prev: ProjectItemsCursor | null,
  reads: ReadonlyArray<ProjectHostRead>,
  nowIso: string,
): { readonly cursor: ProjectItemsCursor; readonly events: ReadonlyArray<ProjectItemEvent> } {
  const hosts: Record<string, HostCursor> = {};
  const events: ProjectItemEvent[] = [];
  for (const read of reads) {
    const before = prev?.hosts[read.host];
    if (before === undefined) {
      hosts[read.host] = { since: nowIso, watchingSince: nowIso, items: {} };
      continue;
    }
    const items: Record<string, HostCursor["items"][string]> = { ...before.items };
    for (const hit of read.items) {
      const item = toProjectItem(read.host, hit);
      const key = `${read.host}:${item.repository}#${item.number}`;
      const remembered = items[key];
      if (remembered !== undefined && remembered.updatedAt >= item.updatedAt) continue;
      const reason = reasonFor(remembered, item.state, item.createdAt, before.watchingSince);
      events.push({ key, payload: { item, reason } });
      items[key] = { updatedAt: item.updatedAt, state: item.state };
    }
    const since = read.complete ? nowIso : before.since;
    const forgetBefore = beforeOverlap(since);
    hosts[read.host] = {
      since,
      watchingSince: before.watchingSince,
      items: Object.fromEntries(
        Object.entries(items).filter(([, entry]) => entry.updatedAt >= forgetBefore),
      ),
    };
  }
  return { cursor: { v: 1, hosts }, events };
}
