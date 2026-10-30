/**
 * `t3team.work_item.search` / `t3team.work_item.get` over a port: the policy half. The port is the
 * mirror, the tracker and the account state; this file owns what may leave the bound project.
 *
 * SCOPE: nothing a caller passes can name another project. Mirror reads are keyed by the binding;
 * every live query is the caller's JQL conjoined with `project in (<bound id>)` by
 * `restrictJqlToProject` (a JQL that cannot be read with confidence is refused, never repaired),
 * and a key outside the project is answered exactly like a key that does not exist. `get` asks the
 * tracker whether the key is in the project BEFORE it returns any mirror content or comments: the
 * mirror keeps a row of an issue that was moved out until its pruning pass, and comments are
 * fetched by key (the tracker resolves a moved key), so neither may vouch for membership.
 */
import { buildWorkItemFilterJql, restrictJqlToProject } from "@t3tools/integrations-atlassian";
import type {
  GetWorkItemToolArgs,
  GetWorkItemToolResult,
  SearchWorkItemsToolArgs,
  SearchWorkItemsToolResult,
  WorkItemSummary,
} from "@t3team/sdk";
import * as Effect from "effect/Effect";

import { makeProjectScope, scoped } from "./t3team-workItemProjectScope.ts";
import type { MirrorFilters } from "./t3team-workItemReadMirror.ts";
import {
  decodeCursor,
  DEFAULT_WORK_ITEM_SEARCH_LIMIT,
  encodeLiveCursor,
  encodeMirrorCursor,
  parseIssueKey,
  toWorkItemSummary,
  type WorkItemResource,
} from "./t3team-workItemReadQuery.ts";
import type { JiraMirrorBinding } from "./t3team-workflowSignalWorkItemProjectMirror.ts";

const CHILD_LIMIT = 50;
const COMMENT_LIMIT = 50;

export interface WorkItemComment {
  readonly id: string;
  readonly author?: string;
  readonly body: string;
  readonly created?: string;
}

export interface WorkItemReadPort {
  readonly mirrorReady: (binding: JiraMirrorBinding) => Effect.Effect<boolean, string>;
  readonly mirrorSearch: (
    binding: JiraMirrorBinding,
    filters: MirrorFilters,
    limit: number,
    offset: number,
  ) => Effect.Effect<ReadonlyArray<WorkItemResource>, string>;
  readonly mirrorGet: (
    binding: JiraMirrorBinding,
    issueKey: string,
  ) => Effect.Effect<WorkItemResource | null, string>;
  readonly mirrorChildren: (
    binding: JiraMirrorBinding,
    parentKey: string,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<WorkItemResource>, string>;
  /** Runs `jql` verbatim: the service only ever passes JQL that went through the project scope. */
  readonly searchLive: (
    binding: JiraMirrorBinding,
    jql: string,
    limit: number,
    cursor: string | undefined,
  ) => Effect.Effect<
    { readonly items: ReadonlyArray<WorkItemResource>; readonly nextCursor?: string | undefined },
    string
  >;
  /** The newest `limit` comments, oldest first; `truncated` when older ones were left out. */
  readonly comments: (
    binding: JiraMirrorBinding,
    issueKey: string,
    limit: number,
  ) => Effect.Effect<
    { readonly comments: ReadonlyArray<WorkItemComment>; readonly truncated: boolean },
    string
  >;
}

const summaries = (resources: ReadonlyArray<WorkItemResource>): WorkItemSummary[] =>
  resources.flatMap((resource) => toWorkItemSummary(resource) ?? []);

export const makeWorkItemReadService = (port: WorkItemReadPort) => {
  const search = Effect.fn("t3team.workItemRead.search")(function* (
    binding: JiraMirrorBinding,
    args: SearchWorkItemsToolArgs,
  ) {
    const limit = args.limit ?? DEFAULT_WORK_ITEM_SEARCH_LIMIT;
    const cursor = decodeCursor(args.cursor);
    if (cursor === null) return yield* Effect.fail("Invalid cursor; pass nextCursor as returned.");
    const filters: MirrorFilters = {
      status: args.status,
      assignee: args.assignee,
      labels: args.labels,
      type: args.type,
      sprint: args.sprint,
      text: args.text,
    };
    const wantsJql = (args.jql ?? "").trim().length > 0;
    const live = wantsJql || cursor?.kind === "live" || !(yield* port.mirrorReady(binding));
    if (!live) {
      const offset = cursor?.kind === "mirror" ? cursor.offset : 0;
      const rows = yield* port.mirrorSearch(binding, filters, limit + 1, offset);
      return {
        ok: true,
        source: "mirror",
        items: summaries(rows.slice(0, limit)),
        ...(rows.length > limit ? { nextCursor: encodeMirrorCursor(offset + limit) } : {}),
      } satisfies SearchWorkItemsToolResult;
    }
    if (cursor?.kind === "mirror") return yield* Effect.fail("Invalid cursor for this search.");
    const narrowing = buildWorkItemFilterJql(filters);
    if (narrowing === null) return yield* Effect.fail("A search value holds a control character.");
    const jql = yield* scoped(
      restrictJqlToProject(args.jql, binding.externalProjectId, narrowing || undefined),
    );
    const page = yield* port.searchLive(
      binding,
      jql,
      limit,
      cursor?.kind === "live" ? cursor.token : undefined,
    );
    return {
      ok: true,
      source: "live",
      items: summaries(page.items),
      ...(page.nextCursor === undefined ? {} : { nextCursor: encodeLiveCursor(page.nextCursor) }),
    } satisfies SearchWorkItemsToolResult;
  });

  const { findInProject } = makeProjectScope(port);

  const get = Effect.fn("t3team.workItemRead.get")(function* (
    binding: JiraMirrorBinding,
    args: GetWorkItemToolArgs,
  ) {
    const key = parseIssueKey(args.issueKey);
    if (key === null) return yield* Effect.fail(`'${args.issueKey}' is not a work item key.`);
    const found = yield* findInProject(binding, key);
    const item = found === null ? null : toWorkItemSummary(found);
    if (found === null || item === null) {
      return yield* Effect.fail(`Work item ${key} is not in this project.`);
    }
    const { comments, truncated } = yield* port.comments(binding, key, COMMENT_LIMIT);
    const childRows = (yield* port.mirrorReady(binding))
      ? yield* port.mirrorChildren(binding, key, CHILD_LIMIT)
      : (yield* port.searchLive(
          binding,
          yield* scoped(restrictJqlToProject(`parent = "${key}"`, binding.externalProjectId)),
          CHILD_LIMIT,
          undefined,
        )).items;
    const description = typeof found["description"] === "string" ? found["description"] : undefined;
    const links = Array.isArray(found["links"]) ? found["links"] : [];
    return {
      ok: true,
      item: { ...item, ...(description === undefined ? {} : { description }) },
      comments,
      commentsTruncated: truncated,
      links: links.flatMap((link: unknown) => {
        const { outward, key: linked } = (link ?? {}) as { outward?: unknown; key?: unknown };
        return typeof outward === "string" && typeof linked === "string"
          ? [{ relation: outward, issueKey: linked }]
          : [];
      }),
      children: summaries(childRows),
    } satisfies GetWorkItemToolResult;
  });

  return { search, get };
};
