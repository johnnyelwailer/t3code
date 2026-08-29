/**
 * Rendering a workflow run's structured JSON result as readable display text.
 *
 * Shared between the server (`t3team-workflowCompletionMessage.ts`, which formats the run's
 * terminal chat message BEFORE it is ever stored) and the web client
 * (`t3team-workflowCompletionDisplayText.ts`, which re-renders a legacy message whose stored text
 * is still raw JSON). Both used to carry their own near-identical copy of this logic, and both
 * copies dropped the same class of data: nested objects and arrays-of-objects were filtered out
 * before rendering, so a result like `{ findings: [...], summaryStats: {...} }` rendered as a bare
 * "nothing to show" fallback with the real data silently gone.
 *
 * The fix here never drops a field. A flat scalar/array renders as `**Title:** value`, as before;
 * a flat nested object or array-of-flat-objects renders as a compact inline/bulleted line; a
 * deeper or awkward shape falls back to a fenced JSON block. Long results truncate visibly rather
 * than growing without bound.
 */

const MAX_LIST_ITEMS = 20;
const MAX_JSON_CHARS = 4000;
const MAX_TOTAL_CHARS = 8000;

type Scalar = string | number | boolean;

function isScalar(value: unknown): value is Scalar {
  return ["string", "number", "boolean"].includes(typeof value);
}

function isScalarArray(value: unknown): value is Scalar[] {
  return Array.isArray(value) && value.every((item) => isScalar(item));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// A "flat" object has only scalar (or null/undefined) values — nothing that itself needs further
// unpacking. These render inline; anything deeper falls back to a JSON block rather than being
// flattened lossily.
function isFlatObject(value: Record<string, unknown>): boolean {
  return Object.values(value).every((v) => isScalar(v) || v === null || v === undefined);
}

function humanizeKey(key: string): string {
  const label = key.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

function formatFlatObjectInline(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "(empty)";
  return entries.map(([key, value]) => `${humanizeKey(key)}: ${formatScalar(value)}`).join(", ");
}

function toFencedJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (json.length > MAX_JSON_CHARS) {
    return `\`\`\`json\n${json.slice(0, MAX_JSON_CHARS)}\n… (truncated, ${json.length - MAX_JSON_CHARS} more characters)\n\`\`\``;
  }
  return `\`\`\`json\n${json}\n\`\`\``;
}

// Renders one top-level field into one markdown block. Never drops a field: anything that isn't
// a flat scalar/array still gets rendered, falling back to a fenced JSON block when the shape is
// too deep or awkward for a compact rendering.
function formatField(key: string, value: unknown): string {
  const title = humanizeKey(key);

  if (isScalar(value)) {
    return `**${title}:** ${String(value)}`;
  }
  if (value === null || value === undefined) {
    return `**${title}:** —`;
  }
  if (isScalarArray(value)) {
    return value.length > 0 ? `**${title}:** ${value.join(", ")}` : `**${title}:** (empty)`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `**${title}:** (empty)`;
    if (value.every((item) => isPlainObject(item) && isFlatObject(item))) {
      const items = value.slice(0, MAX_LIST_ITEMS) as Record<string, unknown>[];
      const lines = items.map((item) => `- ${formatFlatObjectInline(item)}`);
      if (value.length > MAX_LIST_ITEMS) {
        lines.push(`- …and ${value.length - MAX_LIST_ITEMS} more`);
      }
      return `**${title}:**\n${lines.join("\n")}`;
    }
    return `**${title}:**\n${toFencedJson(value)}`;
  }
  if (isPlainObject(value)) {
    if (isFlatObject(value)) {
      return `**${title}:** ${formatFlatObjectInline(value)}`;
    }
    return `**${title}:**\n${toFencedJson(value)}`;
  }
  return `**${title}:** ${String(value)}`;
}

/**
 * Renders a plain record (already known to be a non-null, non-array object) as display text.
 * Checks the `summary`/`message`/`text`/`result` short-circuit first, then humanizes every
 * remaining field — never silently dropping one. `emptyFallback` is the caller's own wording for
 * "nothing readable was found" (the two existing call sites keep their pre-existing exact
 * strings rather than being unified here, since that text is user-visible and unrelated to this
 * fix).
 */
export function renderWorkflowRecordAsDisplayText(
  record: Record<string, unknown>,
  options: { readonly emptyFallback: string },
): string {
  for (const key of ["summary", "message", "text", "result"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  const parts = Object.entries(record).map(([key, value]) => formatField(key, value));
  if (parts.length === 0) return options.emptyFallback;
  // Blank-line separation once anything is multi-line (a nested list or a JSON block); a pure
  // flat result keeps a single-newline join between fields.
  const body = parts.join(parts.some((p) => p.includes("\n")) ? "\n\n" : "\n");
  if (body.length > MAX_TOTAL_CHARS) {
    return `${body.slice(0, MAX_TOTAL_CHARS)}\n\n*(truncated — the full result is larger than shown)*`;
  }
  return body;
}
