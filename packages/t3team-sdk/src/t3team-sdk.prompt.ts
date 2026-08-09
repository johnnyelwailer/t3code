/**
 * `definePrompt` — the second kind of recipe action (Epic 16 §One recipe, several actions).
 *
 * A recipe places actions on UI surfaces; each action either starts a workflow or invokes a
 * prompt. A workflow is usually the better answer because it is structured — explicit steps, a
 * result contract, journaled progress — but a prompt action is the honest model for the cases
 * where the whole recipe IS "open a thread with this instruction", and it is what lets recipes
 * be authored as typed modules without a workflow file per starter.
 *
 * The prompt text reaches the launcher through `ProjectRecipeDiscovered.prompt`, exactly where
 * the retired `recipe.json` + `prompt.md` form used to put it, so no launcher learns a new shape.
 */

/** A prompt action: either a file next to the recipe module, or inline text. */
export interface PromptRef {
  readonly kind: "prompt";
  /** Recipe-relative path to the prompt file (`./prompt.md`). Mutually exclusive with `text`. */
  readonly path?: string;
  /** Inline prompt text, for prompts too short to deserve their own file. */
  readonly text?: string;
}

/**
 * Declares a prompt action.
 *
 * `definePrompt("./prompt.md")` is the shorthand for the common file case; pass
 * `{ text }` for an inline prompt. Supplying both, or neither, is an authoring error — a
 * prompt action with no prompt would launch an empty thread.
 */
export function definePrompt(input: string | { readonly path?: string; readonly text?: string }): PromptRef {
  const spec = typeof input === "string" ? { path: input } : input;
  const path = spec.path?.trim();
  const text = spec.text?.trim();
  if (path && text) {
    throw new Error("definePrompt accepts either 'path' or 'text', not both.");
  }
  if (!path && !text) {
    throw new Error("definePrompt requires a non-empty 'path' or 'text'.");
  }
  if (path && !(path.startsWith("./") || path.startsWith("../"))) {
    throw new Error(
      `definePrompt path must be recipe-relative (start with './' or '../'); got '${path}'.`,
    );
  }
  return Object.freeze({
    kind: "prompt" as const,
    ...(path ? { path } : {}),
    ...(text ? { text } : {}),
  });
}

/** True for any `definePrompt(...)` result. Narrows an action ref to the prompt kind. */
export function isPromptRef(value: unknown): value is PromptRef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "prompt"
  );
}
