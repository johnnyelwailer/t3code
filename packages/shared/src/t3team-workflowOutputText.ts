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
 * an array of flat objects renders as a markdown table; a deeper shape renders as nested bullet
 * lists. Raw JSON never reaches the reader (GHE #409/#418): the thread is a conversation, not a
 * debugger. Long results truncate visibly rather than growing without bound.
 */

const MAX_LIST_ITEMS = 20;
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

const MAX_NESTED_DEPTH = 4;

function escapeCell(value: unknown): string {
  return formatScalar(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** An array of flat objects as a markdown table (union of keys, first-seen order, capped rows). */
function toTable(rows: Record<string, unknown>[]): string {
  const keys: string[] = [];
  for (const row of rows)
    for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  const shown = rows.slice(0, MAX_LIST_ITEMS);
  const lines = [
    `| ${keys.map(humanizeKey).join(" | ")} |`,
    `| ${keys.map(() => "---").join(" | ")} |`,
    ...shown.map((row) => `| ${keys.map((key) => escapeCell(row[key])).join(" | ")} |`),
  ];
  if (rows.length > MAX_LIST_ITEMS) lines.push(`*…and ${rows.length - MAX_LIST_ITEMS} more*`);
  return lines.join("\n");
}

/** Any value as nested bullets — the readable fallback for shapes too deep for inline/table. */
function toNestedList(value: unknown, depth: number): string {
  const pad = "  ".repeat(depth);
  if (depth >= MAX_NESTED_DEPTH) return `${pad}- …`;
  if (isScalar(value) || value === null || value === undefined)
    return `${pad}- ${formatScalar(value)}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}- (empty)`;
    const items = value
      .slice(0, MAX_LIST_ITEMS)
      .map((item) =>
        isScalar(item) || item === null || item === undefined
          ? `${pad}- ${formatScalar(item)}`
          : isPlainObject(item) && isFlatObject(item)
            ? `${pad}- ${formatFlatObjectInline(item)}`
            : toNestedList(item, depth),
      );
    if (value.length > MAX_LIST_ITEMS)
      items.push(`${pad}- …and ${value.length - MAX_LIST_ITEMS} more`);
    return items.join("\n");
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${pad}- (empty)`;
    return entries
      .map(([key, child]) =>
        isScalar(child) || child === null || child === undefined
          ? `${pad}- ${humanizeKey(key)}: ${formatScalar(child)}`
          : `${pad}- ${humanizeKey(key)}:\n${toNestedList(child, depth + 1)}`,
      )
      .join("\n");
  }
  return `${pad}- ${String(value)}`;
}

/**
 * Any run result (not only a record) as display text: strings pass through, arrays of flat objects
 * become a table, other arrays and deep objects become nested bullets, scalars are stringified.
 */
export function renderWorkflowValueAsDisplayText(
  value: unknown,
  options: { readonly emptyFallback: string },
): string {
  if (typeof value === "string") return value.trim().length > 0 ? value : options.emptyFallback;
  if (value === undefined || value === null) return options.emptyFallback;
  if (isScalar(value)) return String(value);
  if (isPlainObject(value)) return renderWorkflowRecordAsDisplayText(value, options);
  if (Array.isArray(value)) {
    if (value.length === 0) return options.emptyFallback;
    if (isScalarArray(value)) return value.map((item) => `- ${String(item)}`).join("\n");
    if (value.every((item) => isPlainObject(item) && isFlatObject(item))) {
      return toTable(value as Record<string, unknown>[]);
    }
    return toNestedList(value, 0);
  }
  return String(value);
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
      return `**${title}:**\n${toTable(value as Record<string, unknown>[])}`;
    }
    return `**${title}:**\n${toNestedList(value, 0)}`;
  }
  if (isPlainObject(value)) {
    if (isFlatObject(value)) {
      return `**${title}:** ${formatFlatObjectInline(value)}`;
    }
    return `**${title}:**\n${toNestedList(value, 0)}`;
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
  // Blank-line separation once anything is multi-line (a table or nested list); a pure
  // flat result keeps a single-newline join between fields.
  const body = parts.join(parts.some((p) => p.includes("\n")) ? "\n\n" : "\n");
  if (body.length > MAX_TOTAL_CHARS) {
    return `${body.slice(0, MAX_TOTAL_CHARS)}\n\n*(truncated — the full result is larger than shown)*`;
  }
  return body;
}
