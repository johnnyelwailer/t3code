/**
 * Pure helpers of the work-item read tools: the neutral summary a provider/mirror resource maps to,
 * and the page cursor. A cursor names the path that produced it (`m:` mirror offset, `l:` live page
 * token) so a continuation can never be answered by the other path.
 */
import type { WorkItemSummary } from "@t3team/sdk";

export type WorkItemResource = Readonly<Record<string, unknown>>;

export const DEFAULT_WORK_ITEM_SEARCH_LIMIT = 25;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/** The provider resource as the neutral work item; null when it carries no key or title. */
export function toWorkItemSummary(resource: WorkItemResource): WorkItemSummary | null {
  const issueKey = asString(resource["displayId"]) ?? asString(resource["id"]);
  const title = asString(resource["title"]);
  if (issueKey === undefined || title === undefined) return null;
  const labels = Array.isArray(resource["labels"])
    ? resource["labels"].filter((label): label is string => typeof label === "string")
    : undefined;
  const optional = {
    url: asString(resource["url"]),
    state: asString(resource["status"]),
    assignee: asString(resource["assignee"]),
    updatedAt: asString(resource["updatedAt"]),
    type: asString(resource["type"]),
    priority: asString(resource["priority"]),
    parentKey: asString(resource["parentId"]),
    sprint: asString(resource["sprintName"]),
  };
  return {
    provider: asString(resource["provider"]) ?? "atlassian",
    issueKey,
    title,
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
    ...(labels === undefined || labels.length === 0 ? {} : { labels }),
  };
}

export type SearchCursor =
  | { readonly kind: "mirror"; readonly offset: number }
  | { readonly kind: "live"; readonly token: string };

export const encodeMirrorCursor = (offset: number): string => `m:${offset}`;
export const encodeLiveCursor = (token: string): string => `l:${token}`;

/** `undefined` for no cursor, `null` for one this host did not issue. */
export function decodeCursor(cursor: string | undefined): SearchCursor | null | undefined {
  if (cursor === undefined) return undefined;
  if (cursor.startsWith("l:") && cursor.length > 2) return { kind: "live", token: cursor.slice(2) };
  const offset = cursor.startsWith("m:") ? Number(cursor.slice(2)) : Number.NaN;
  return Number.isSafeInteger(offset) && offset >= 0 ? { kind: "mirror", offset } : null;
}

/** A work item key as `PROJ-12`; the only shape interpolated into JQL by the get tool. */
export function parseIssueKey(raw: string): string | null {
  const key = raw.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]*-[0-9]+$/.test(key) ? key : null;
}
