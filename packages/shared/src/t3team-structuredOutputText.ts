/**
 * Deterministic text rendering of structured (JSON) output, for surfaces that
 * cannot host a rich widget (the server-side abnormal-stop notification). See
 * `t3team-structuredOutput` for the generic parse and time helpers.
 *
 * @module t3team-structuredOutputText
 */

import {
  type StructuredOutput,
  type StructuredOutputOptions,
  formatInstantLocal,
} from "./t3team-structuredOutput.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Render a scalar value as text, converting ISO timestamps to local time. */
export function renderScalar(value: unknown, options: StructuredOutputOptions = {}): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  const local = formatInstantLocal(value, options);
  if (local !== null) return local;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "null";
}

/**
 * Render a structured output as deterministic, human-readable text. Returns
 * null when the output is not structured JSON, so the caller keeps the raw
 * string.
 *
 * @example
 *   "HTTP 423\n  type: reservation_error\n  author: jb\n  ends_at: 09:21"
 */
export function renderStructuredOutputText(
  output: StructuredOutput,
  options: StructuredOutputOptions = {},
): string | null {
  if (output.value === null) return null;
  const value = output.value;
  const lines: string[] = [];
  const topDepth = output.status !== null ? 1 : 0;
  if (output.status !== null) lines.push(`HTTP ${output.status}`);
  appendNode(value, lines, topDepth, options);
  return lines.join("\n");
}

function appendNode(
  value: Record<string, unknown> | readonly unknown[],
  lines: string[],
  depth: number,
  options: StructuredOutputOptions,
): void {
  const pad = "  ".repeat(depth);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (isPlainObject(item) || Array.isArray(item)) {
        lines.push(`${pad}[${index}]`);
        appendNode(item, lines, depth + 1, options);
      } else {
        lines.push(`${pad}[${index}]: ${renderScalar(item, options)}`);
      }
    });
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (isPlainObject(entry) || Array.isArray(entry)) {
      lines.push(`${pad}${key}:`);
      appendNode(entry, lines, depth + 1, options);
    } else {
      lines.push(`${pad}${key}: ${renderScalar(entry, options)}`);
    }
  }
}
