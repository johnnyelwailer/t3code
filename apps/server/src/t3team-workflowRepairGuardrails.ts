/** Static host guardrails for agent-proposed ephemeral workflow replacements. */
import { extractMeta, prepareWorkflow } from "@t3team/sdk";
import * as Schema from "effect/Schema";

type MetaRecord = Record<string, unknown>;
const unsafePatterns = [
  /\bimport\s*(?:\(|[^;\n]*?\bfrom\s*)["']node:/g,
  /\brequire\s*\(/g,
  /\b(?:eval|Function)\s*\(/g,
  /\bprocess\s*\./g,
];

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value].sort()
    : value === undefined
      ? []
      : null;

const sameStrings = (left: unknown, right: unknown): boolean => {
  const a = strings(left);
  const b = strings(right);
  return (
    a !== null && b !== null && a.length === b.length && a.every((item, index) => item === b[index])
  );
};

const unsafeTokens = (source: string): Set<string> =>
  new Set(
    unsafePatterns.flatMap((pattern) =>
      [...source.matchAll(pattern)].map((match) => match[0].replace(/\s+/g, " ")),
    ),
  );

/** Parse with the production loader and keep the original authority envelope exactly unchanged. */
export const validateWorkflowRepairCandidate = (input: {
  readonly originalSource: string;
  readonly replacementSource: unknown;
  readonly absolutePath: string;
}): string | null => {
  if (typeof input.replacementSource !== "string") return null;
  const replacement = input.replacementSource.trim();
  if (!replacement || replacement.length > 200_000) return null;
  try {
    const original = extractMeta(
      prepareWorkflow({ absolutePath: input.absolutePath, sourceText: input.originalSource }),
      { absolutePath: input.absolutePath, sourceText: input.originalSource },
      Schema,
    ) as unknown as MetaRecord;
    const repaired = extractMeta(
      prepareWorkflow({ absolutePath: input.absolutePath, sourceText: replacement }),
      { absolutePath: input.absolutePath, sourceText: replacement },
      Schema,
    ) as unknown as MetaRecord;
    if (
      !sameStrings(original.capabilities, repaired.capabilities) ||
      !sameStrings(original.toolGroups, repaired.toolGroups) ||
      !sameStrings(original.permissions, repaired.permissions)
    )
      return null;
    const originalUnsafe = unsafeTokens(input.originalSource);
    if ([...unsafeTokens(replacement)].some((token) => !originalUnsafe.has(token))) return null;
  } catch {
    return null;
  }
  return input.replacementSource;
};
