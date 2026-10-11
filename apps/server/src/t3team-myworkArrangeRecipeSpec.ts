/** Structured input for the generated My Work maintain recipe. Not free-form source. */

const RECIPE_ID = /^[a-z][a-z0-9-]{0,40}$/;

export type MyWorkArrangeRecipeSpec = {
  readonly id: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly digestScope: "project" | "all";
  readonly density: "compact" | "comfortable";
  readonly focus: string;
  readonly noise: string;
  readonly everyHours: number;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return undefined;
  return trimmed;
};

export function parseMyWorkArrangeRecipeSpec(
  input: unknown,
): { readonly ok: true; readonly spec: MyWorkArrangeRecipeSpec } | { readonly ok: false; readonly message: string } {
  const record = asRecord(input);
  if (record === undefined) return { ok: false, message: "recipe must be an object." };
  const id = text(record.id, 41);
  if (id === undefined || !RECIPE_ID.test(id)) {
    return { ok: false, message: "recipe.id must be a short kebab-case id." };
  }
  const title = text(record.title, 80);
  const shortDescription = text(record.shortDescription, 200);
  const focus = text(record.focus, 400);
  const noise = text(record.noise, 400);
  if (title === undefined || shortDescription === undefined || focus === undefined || noise === undefined) {
    return { ok: false, message: "recipe needs title, shortDescription, focus, and noise." };
  }
  if (record.digestScope !== "project" && record.digestScope !== "all") {
    return { ok: false, message: "recipe.digestScope must be 'project' or 'all'." };
  }
  if (record.density !== "compact" && record.density !== "comfortable") {
    return { ok: false, message: "recipe.density must be 'compact' or 'comfortable'." };
  }
  const everyHours = record.everyHours;
  if (typeof everyHours !== "number" || !Number.isInteger(everyHours) || everyHours < 1 || everyHours > 168) {
    return { ok: false, message: "recipe.everyHours must be an integer from 1 to 168." };
  }
  return {
    ok: true,
    spec: {
      id,
      title,
      shortDescription,
      digestScope: record.digestScope,
      density: record.density,
      focus,
      noise,
      everyHours,
    },
  };
}
