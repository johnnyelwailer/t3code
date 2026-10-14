/**
 * Pure helpers for optimistic cloud-session selection in the Run-on control.
 * A pending target is a preference until the first send binds it; the Select
 * trigger uses a sentinel value so it never stays on "This computer".
 */

export const CLOUD_SESSION_CREATING_ID = "__creating__";

export function cloudSessionSelectValue(sessionId: string): string {
  return `__cloud-session:${sessionId}`;
}

export function parseCloudSessionSelectValue(value: string): string | null {
  const prefix = "__cloud-session:";
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}
