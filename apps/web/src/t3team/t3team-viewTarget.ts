/**
 * A Team view a thread's right panel can show as a tab beside the chat: the project's My Work, or
 * one work item. The target is everything the tab needs to render and to survive a reload, so it
 * is persisted with the panel and validated on the way back in.
 */
export type T3TeamViewTarget =
  | { readonly kind: "my-work"; readonly projectId: string }
  | {
      readonly kind: "work-item";
      readonly projectId: string;
      readonly ticketId: string;
      /** The tracker key ("NX-4711"), when the opener knew it. */
      readonly displayId?: string;
      /** The work item's summary, when the opener knew it. */
      readonly title?: string;
    };

export type T3TeamViewSurfaceId = `view:${string}`;

export function viewSurfaceId(target: T3TeamViewTarget): T3TeamViewSurfaceId {
  return target.kind === "my-work"
    ? `view:my-work:${target.projectId}`
    : `view:work-item:${target.projectId}:${target.ticketId}`;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isOptionalString = (value: unknown) => value === undefined || typeof value === "string";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isT3TeamViewTarget(value: unknown): value is T3TeamViewTarget {
  if (!isRecord(value) || !isNonEmptyString(value.projectId)) return false;
  if (value.kind === "my-work") return true;
  return (
    value.kind === "work-item" &&
    isNonEmptyString(value.ticketId) &&
    isOptionalString(value.displayId) &&
    isOptionalString(value.title)
  );
}

/** Rebuilt field by field, so a stored target carries nothing the tab does not know. */
export function normalizeViewTarget(target: T3TeamViewTarget): T3TeamViewTarget {
  if (target.kind === "my-work") return { kind: "my-work", projectId: target.projectId };
  return {
    kind: "work-item",
    projectId: target.projectId,
    ticketId: target.ticketId,
    ...(target.displayId ? { displayId: target.displayId } : {}),
    ...(target.title ? { title: target.title } : {}),
  };
}

export function viewTargetTitle(target: T3TeamViewTarget): string {
  if (target.kind === "my-work") return "My Work";
  return [target.displayId ?? target.ticketId, target.title].filter(Boolean).join(" ");
}
