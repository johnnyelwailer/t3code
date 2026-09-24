/**
 * Generic, provider-agnostic rendering of structured (JSON) output.
 *
 * Many surfaces (thread errors, tool results, provider notices) receive a raw
 * string that is really a JSON object — often with a leading HTTP status,
 * e.g. `423: {"type":"reservation_error","author":"jb",...}`. Dumps of that raw
 * blob are unreadable. This module parses such a string into a small model
 * (optional status code + the parsed value) and provides helpers to render it:
 * complete (never truncated), with ISO timestamps shown in the viewer's local
 * time.
 *
 * It is deliberately generic: it does NOT know or map provider-specific field
 * names or produce provider-specific titles. A host that wants a bespoke
 * presentation supplies its own (host-defined UI extension point); everything
 * else reuses this.
 *
 * Fail-safe: anything that is not a JSON object/array is returned with
 * `value: null`, so callers fall back to the raw string unchanged.
 *
 * @module t3team-structuredOutput
 */

export interface StructuredOutput {
  /** Leading HTTP status code when the string was `<status>: <json>`, else null. */
  readonly status: number | null;
  /** The parsed JSON value (object or array), or null when not structured JSON. */
  readonly value: Record<string, unknown> | readonly unknown[] | null;
  /** The original raw string, preserved verbatim. */
  readonly raw: string;
}

export interface StructuredOutputOptions {
  /** Reference instant (epoch ms) for deciding whether a timestamp is "today". Defaults to the current time. */
  readonly now?: number;
  /** IANA time zone for rendering timestamps. Defaults to the viewer's local zone. */
  readonly timeZone?: string;
}

const STATUS_PREFIX = /^\s*(\d{3})\s*:\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/;
const BARE_JSON = /^\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/;

function tryParse(text: string): Record<string, unknown> | readonly unknown[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  return parsed as Record<string, unknown> | readonly unknown[];
}

/**
 * Split a `<status>: <json>` / bare `<json>` string into its status and parsed
 * value. Returns `value: null` when the string is not structured JSON.
 */
export function parseStructuredOutput(raw: string): StructuredOutput {
  const trimmed = raw.trim();
  const statusMatch = STATUS_PREFIX.exec(trimmed);
  if (statusMatch) {
    return { status: Number(statusMatch[1]), value: tryParse(statusMatch[2]!), raw };
  }
  const bare = BARE_JSON.exec(trimmed);
  if (bare) {
    const value = tryParse(bare[1]!);
    if (value !== null) return { status: null, value, raw };
  }
  return { status: null, value: null, raw };
}

/** True when `output.value` is a structured object or array. */
export function isStructuredOutput(output: StructuredOutput): boolean {
  return output.value !== null;
}

/** True when `value` is an ISO-8601 date-time string (with optional offset/zone). */
export function isIsoInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(value)
  );
}

/**
 * Render an ISO date-time as a local wall-clock time, adding the day when it is
 * not today in the target zone. Returns null when `value` is not an instant.
 */
export function formatInstantLocal(
  value: unknown,
  options: StructuredOutputOptions = {},
): string | null {
  if (!isIsoInstant(value)) return null;
  const instantMs = Date.parse(value);
  if (Number.isNaN(instantMs)) return null;
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: options.timeZone,
  }).format(instantMs);
  // The "not today" day suffix needs a reference instant; when the caller does
  // not supply one, render the local time without a date qualifier.
  if (options.now === undefined) return time;
  const dayFormat = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone: options.timeZone,
  });
  const day = dayFormat.format(instantMs);
  return day === dayFormat.format(options.now) ? time : `${time} (${day})`;
}

