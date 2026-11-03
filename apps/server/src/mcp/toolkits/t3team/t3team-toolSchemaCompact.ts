/**
 * Advertised-schema compaction for the fork's own tools. Decoding keeps the full codec; only the
 * JSON Schema an agent reads shrinks. A `Schema.Number` field advertises
 * `anyOf [number, "Infinity" | "-Infinity" | "NaN"]` because the JSON codec spells non-finite
 * numbers as strings; no agent sends those, so the advertised field is a plain number.
 */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const NON_FINITE_SPELLINGS = new Set(["Infinity", "-Infinity", "NaN"]);

const isNonFiniteSpelling = (branch: unknown): boolean =>
  isObject(branch) &&
  branch.type === "string" &&
  Array.isArray(branch.enum) &&
  branch.enum.length === NON_FINITE_SPELLINGS.size &&
  branch.enum.every((value) => typeof value === "string" && NON_FINITE_SPELLINGS.has(value));

export function dropNonFiniteNumberSpellings(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(dropNonFiniteNumberSpellings);
  if (!isObject(schema)) return schema;
  const { anyOf, ...rest } = schema;
  if (Array.isArray(anyOf) && anyOf.length === 2 && anyOf.some(isNonFiniteSpelling)) {
    const kept = anyOf.find((branch) => !isNonFiniteSpelling(branch));
    if (isObject(kept)) {
      return dropNonFiniteNumberSpellings({ ...kept, ...rest });
    }
  }
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, dropNonFiniteNumberSpellings(value)]),
  );
}
