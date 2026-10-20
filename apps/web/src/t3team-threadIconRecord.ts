import { ProjectIconOverride } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export type ThreadIconByThreadId = Record<string, ProjectIconOverride>;

const isProjectIconOverride = Schema.is(ProjectIconOverride);

export function sanitizeThreadIconRecord(value: unknown): ThreadIconByThreadId {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, ProjectIconOverride] =>
        entry[0].length > 0 && isProjectIconOverride(entry[1]),
    ),
  );
}

export function withThreadIcon(
  record: ThreadIconByThreadId,
  threadId: string,
  icon: ProjectIconOverride,
): ThreadIconByThreadId {
  return { ...record, [threadId]: icon };
}
