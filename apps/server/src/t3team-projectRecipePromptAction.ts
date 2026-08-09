/**
 * Resolving a recipe's PROMPT actions (`definePrompt`), the non-workflow half of
 * Epic 16 §One recipe, several actions.
 *
 * Kept beside {@link ./t3team-projectRecipeActions.ts} rather than inside it: that module owns the
 * workflow allow-list that execution authorization is bound to, and mixing a second resolution
 * shape into it made it the largest file in the recipe path for no structural reason.
 *
 * A prompt file is constrained to the recipe directory by the same `resolveWithinRoot` rule as a
 * workflow. A prompt is read and sent to a model, so an escaping `../` path would exfiltrate file
 * contents just as surely as an escaping workflow path would execute foreign code.
 */

import type * as Path from "effect/Path";

import type { PromptRef } from "@t3team/sdk";

import { resolveWithinRoot } from "./t3team-projectRecipeDiscoveryShared.ts";

export type ResolvedPromptSource = {
  /** Absolute prompt-file path, for `definePrompt("./prompt.md")`. */
  readonly promptPath?: string;
  /** Inline prompt text, for `definePrompt({ text })`. */
  readonly promptText?: string;
};

export function resolvePromptActionSource(
  pathService: Path.Path,
  recipePath: string,
  ref: PromptRef,
): ResolvedPromptSource {
  return {
    ...(ref.path ? { promptPath: resolveWithinRoot(pathService, recipePath, ref.path) } : {}),
    ...(ref.text ? { promptText: ref.text } : {}),
  };
}
