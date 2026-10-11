/**
 * Input rules for `Thread.showView`, shared by the run-side primitive (so an author gets the error
 * at the call site) and the host that stores the view (which must not trust the run).
 */
import type { ShowViewInput } from "./types.ts";

/** `<namespace>.<name>[.<more>]`: the namespace is the registering pack's id. */
const VIEW_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9][A-Za-z0-9_-]*)+$/;
const VIEW_KEY = /^[A-Za-z0-9:/@#._-]{1,256}$/;
const MAX_VIEW_ID_LENGTH = 128;
/**
 * Namespaces a workflow may not post into. `t3team.*` are the host's own views (the decision card,
 * the run's shape card): their props are host state, posted by their own verbs (`askUser`, the run
 * itself), so a body must not be able to forge one.
 */
const RESERVED_VIEW_NAMESPACES: ReadonlySet<string> = new Set(["t3team"]);
/** Props are ids and small values for the view to look things up by, not content. */
export const SHOW_VIEW_MAX_PROPS_BYTES = 16 * 1024;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

/** The namespace a view id belongs to (`"acme.burndown"` → `"acme"`). */
export function showViewNamespace(viewId: string): string {
  return viewId.slice(0, viewId.indexOf("."));
}

/** Why `input` cannot be shown, or `null` when it can. */
export function showViewInputProblem(input: ShowViewInput): string | null {
  if (typeof input?.viewId !== "string" || input.viewId.length > MAX_VIEW_ID_LENGTH) {
    return `viewId must be a string of at most ${MAX_VIEW_ID_LENGTH} characters`;
  }
  if (!VIEW_ID.test(input.viewId)) {
    return `viewId "${input.viewId}" must look like "<packId>.<name>"`;
  }
  if (RESERVED_VIEW_NAMESPACES.has(showViewNamespace(input.viewId))) {
    return `viewId "${input.viewId}" is a host view; a workflow cannot post it`;
  }
  if (typeof input.key !== "string" || !VIEW_KEY.test(input.key)) {
    return "key must be 1-256 characters of [A-Za-z0-9:/@#._-]";
  }
  if (!isPlainObject(input.props)) return "props must be a plain object";
  let serialized: string;
  try {
    serialized = JSON.stringify(input.props);
  } catch {
    return "props must be JSON-serializable";
  }
  if (new TextEncoder().encode(serialized).length > SHOW_VIEW_MAX_PROPS_BYTES) {
    return `props must serialize to at most ${SHOW_VIEW_MAX_PROPS_BYTES} bytes`;
  }
  return null;
}
