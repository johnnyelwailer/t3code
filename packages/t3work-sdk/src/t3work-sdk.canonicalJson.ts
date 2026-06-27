/**
 * Deterministic canonical JSON + argument hashing for the workflow journal.
 *
 * `argsHash` must be byte-stable across the original run and every replay so the engine
 * can detect divergence. `JSON.stringify` is *not* canonical — object key order follows
 * insertion order, which a deterministic body can still vary (e.g. spreading a record).
 * {@link canonicalJsonStringify} fixes a total order (lexicographic keys) and rejects the
 * non-JSON values that would make a hash ambiguous (NaN/Infinity, bigint, functions,
 * symbols). `undefined` object properties are dropped, matching `JSON.stringify`.
 *
 * Top-level `undefined` is normalized to `null` by {@link hashArgs} so a zero-arg call
 * (`tools.demo.ping()`, `scripts.freshTicket()`) produces a stable hash instead of
 * throwing. `undefined` and `null` args therefore hash identically — both mean "no
 * arguments". (Spec doc 25 §determinism contract; reviewer finding E3.)
 *
 * Two modes. **Args mode** (default, used by {@link hashArgs}) is lenient: `undefined`
 * object properties are dropped and exotic objects are best-effort. **Result mode**
 * (`strict`, used by {@link canonicalJsonError} before a journal line is written) is strict:
 * it rejects nested `undefined` and non-plain-object prototypes (`Map`/`Set`/class
 * instances, which would otherwise canonicalize to `{}`) so a recorded result can't be
 * silently corrupted on the round-trip. Both modes reject NaN/Infinity, bigint, functions,
 * and symbols; cyclic structures overflow the stack.
 */

import { createHash } from "node:crypto";

function canonicalizeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `Cannot hash a non-finite number (${String(value)}); workflow arguments must be canonical JSON.`,
    );
  }
  // JSON.stringify renders finite numbers in canonical form (e.g. -0 → "0", 1e21 → "1e+21").
  return JSON.stringify(value);
}

function canonicalizeArray(value: ReadonlyArray<unknown>, strict: boolean): string {
  // Holes / `undefined` entries serialize to `null`, matching JSON.stringify of arrays.
  return `[${value.map((item) => (item === undefined ? "null" : canonicalJsonStringify(item, strict))).join(",")}]`;
}

/** Result mode only: reject objects that aren't plain records — Map/Set/class instances
 * canonicalize to `{}` (silent data loss) and have no place in a JSON result. */
function assertPlainObject(value: object): void {
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== null && proto !== Object.prototype) {
    const name =
      (proto.constructor as { readonly name?: string } | undefined)?.name ?? "non-plain object";
    throw new TypeError(
      `Cannot encode a ${name} as a workflow result; return a plain JSON object (Map/Set/class instances are not canonical JSON).`,
    );
  }
}

function canonicalizeObject(value: Readonly<Record<string, unknown>>, strict: boolean): string {
  if (strict) assertPlainObject(value);
  const keys = Object.keys(value);
  if (strict) {
    for (const key of keys) {
      if (value[key] === undefined) {
        throw new TypeError(
          `Cannot encode \`undefined\` at property '${key}' of a workflow result; drop the key or return null.`,
        );
      }
    }
  }
  const sorted = keys.filter((key) => value[key] !== undefined).toSorted();
  const entries = sorted.map(
    (key) => `${JSON.stringify(key)}:${canonicalJsonStringify(value[key], strict)}`,
  );
  return `{${entries.join(",")}}`;
}

/**
 * Render `value` as canonical JSON: object keys sorted lexicographically, non-finite
 * numbers and non-JSON types rejected. In `strict` (result) mode, nested `undefined` and
 * non-plain-object prototypes are rejected too; in the default (args) mode, `undefined`
 * object properties are dropped. The output is a deterministic string suitable for hashing.
 */
export function canonicalJsonStringify(value: unknown, strict = false): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string": {
      return JSON.stringify(value);
    }
    case "boolean": {
      return value ? "true" : "false";
    }
    case "number": {
      return canonicalizeNumber(value);
    }
    case "object": {
      if (Array.isArray(value)) {
        return canonicalizeArray(value, strict);
      }
      // Honor a custom toJSON (e.g. Date) before treating as a plain record.
      const candidate = value as { readonly toJSON?: () => unknown };
      if (typeof candidate.toJSON === "function") {
        return canonicalJsonStringify(candidate.toJSON(), strict);
      }
      return canonicalizeObject(value as Readonly<Record<string, unknown>>, strict);
    }
    case "undefined": {
      throw new TypeError(
        "Cannot hash `undefined`; workflow arguments must serialize to canonical JSON.",
      );
    }
    default: {
      // bigint, function, symbol
      throw new TypeError(
        `Cannot hash a value of type '${typeof value}'; workflow arguments must be canonical JSON.`,
      );
    }
  }
}

/**
 * SHA-256 (hex) of the canonical-JSON encoding of `args`. A top-level `undefined`
 * (a zero-arg primitive call) is normalized to `null` so the call still hashes to a
 * stable value rather than throwing.
 */
export function hashArgs(args: unknown): string {
  const normalized = args === undefined ? null : args;
  return createHash("sha256").update(canonicalJsonStringify(normalized)).digest("hex");
}

/**
 * True when `value` can be re-encoded to the journal as canonical JSON. Used to validate a
 * primitive's result *before* the journal line is written (so corruption fails loud at the
 * write, not silently at the read). Uses strict (result) mode: nested `undefined` and
 * non-plain prototypes are rejected. Returns the failure reason instead of throwing.
 */
export function canonicalJsonError(value: unknown): Error | undefined {
  try {
    canonicalJsonStringify(value, /* strict */ true);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** First `length` hex chars of a hash — used in human-facing drift messages. */
export function hashPrefix(hash: string, length = 12): string {
  return hash.slice(0, length);
}
