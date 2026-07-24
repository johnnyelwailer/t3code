// @effect-diagnostics preferSchemaOverJson:off - fixture bundles are unknown JSON blobs.
import type { ExternalResourceRef, ResourceSnapshot } from "@t3tools/project-context";

import {
  fixtureTicketKey,
  type T3workFixtureProjectSource,
  type T3workFixtureTicket,
} from "./t3work-fixtureProjectSourceLoad.ts";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Fixture ticket -> `ExternalResourceRef`, the exact shape the Atlassian provider returns from
 * `listResources`. Keeping `provider: "atlassian"` is what lets the shared refresh path,
 * the backlog cache and the ticket surfaces treat a fixture project like a synced one.
 */
export function fixtureTicketToResourceRef(input: {
  readonly ticket: T3workFixtureTicket;
  readonly externalProjectId: string;
}): ExternalResourceRef {
  const ticket = input.ticket;
  const key = fixtureTicketKey(ticket);
  const type = ticket.issueType ?? optionalString(ticket.ref.type);
  return {
    provider: "atlassian",
    kind: "issue",
    id: key,
    displayId: key,
    title: String(ticket.ref.title ?? key),
    projectId: input.externalProjectId,
    ...(ticket.parentId ? { parentId: ticket.parentId.toUpperCase() } : {}),
    ...(ticket.description ? { description: ticket.description } : {}),
    ...(type ? { type } : {}),
    ...(optionalString(ticket.ref.url) ? { url: String(ticket.ref.url) } : {}),
    ...(ticket.status ? { status: ticket.status } : {}),
    ...(ticket.priority ? { priority: ticket.priority } : {}),
    ...(ticket.assignee ? { assignee: ticket.assignee } : {}),
    ...(ticket.labels ? { labels: [...ticket.labels] } : {}),
    ...(ticket.updatedAt ? { updatedAt: ticket.updatedAt } : {}),
  };
}

/**
 * Jira-shaped `raw` payload. `t3work-context-jira-relationships.ts` reads parent/subtask/
 * issuelink structures out of exactly these paths, so fixture relations land in
 * `t3work_context_edges` through the same extractor the live sync uses.
 */
function buildFixtureRawFields(input: {
  readonly ticket: T3workFixtureTicket;
  readonly source: T3workFixtureProjectSource;
}) {
  const ticket = input.ticket;
  const key = fixtureTicketKey(ticket);
  const childKeys = input.source.childKeysByParentKey.get(key) ?? [];
  return {
    key,
    fields: {
      ...(ticket.parentId ? { parent: { key: ticket.parentId.toUpperCase() } } : {}),
      subtasks: childKeys.map((childKey) => ({ key: childKey })),
      issuelinks: (ticket.links ?? []).map((link) => {
        const direction = link.direction ?? "outward";
        const side = direction === "inward" ? "inwardIssue" : "outwardIssue";
        return {
          type: { [direction]: link.relation },
          [side]: { key: link.key.toUpperCase() },
        };
      }),
    },
  };
}

function renderFixtureText(ticket: T3workFixtureTicket): string {
  const comments = (ticket.comments ?? []).map(
    (comment) =>
      `[${comment.createdAt ?? "unknown"}] ${comment.author ?? "unknown"}: ${comment.body ?? ""}`,
  );
  return [ticket.description ?? "", ...comments].filter((part) => part.length > 0).join("\n\n");
}

/**
 * Fixture ticket -> `ResourceSnapshot`. Every field the recipes' signals and the ticket
 * surfaces read (`status`, `type`, `priority`, `assignee`, `statusSince`, estimates,
 * `comments`) is carried in `fields` so the projections hold real, queryable values.
 */
export function fixtureTicketToResourceSnapshot(input: {
  readonly ticket: T3workFixtureTicket;
  readonly source: T3workFixtureProjectSource;
  readonly fetchedAt: string;
}): ResourceSnapshot {
  const ticket = input.ticket;
  const ref = fixtureTicketToResourceRef({
    ticket,
    externalProjectId: input.source.externalProjectId,
  });
  return {
    ref,
    fetchedAt: input.fetchedAt,
    ...(ticket.description ? { summary: ticket.description.split("\n")[0] } : {}),
    fields: {
      status: ticket.status ?? "Unknown",
      ...(ref.type ? { type: ref.type } : {}),
      ...(ticket.priority ? { priority: ticket.priority } : {}),
      ...(ticket.assignee ? { assignee: ticket.assignee } : {}),
      ...(ticket.statusSince ? { statusSince: ticket.statusSince } : {}),
      ...(typeof ticket.estimateHours === "number" ? { estimateHours: ticket.estimateHours } : {}),
      ...(typeof ticket.timeSpentHours === "number"
        ? { timeSpentHours: ticket.timeSpentHours }
        : {}),
      ...(ticket.labels ? { labels: [...ticket.labels] } : {}),
      ...(ticket.description ? { description: ticket.description } : {}),
      comments: [...(ticket.comments ?? [])],
    },
    text: renderFixtureText(ticket),
    raw: buildFixtureRawFields({ ticket, source: input.source }),
  };
}

export function fixtureResourcePage(source: T3workFixtureProjectSource) {
  const items = source.tickets.map((ticket) =>
    fixtureTicketToResourceRef({ ticket, externalProjectId: source.externalProjectId }),
  );
  return { items, totalCount: items.length };
}
