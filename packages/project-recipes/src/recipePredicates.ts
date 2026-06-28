import * as Schema from "effect/Schema";

import type { RecipeMatchSignals } from "./recipeSignals.ts";
import { RECIPE_SIGNAL_KEYS, type RecipeSignalKey } from "./recipeSignals.ts";

export type RecipePredicateResult = true | false | "unknown";

const RecipeSignalScalar = Schema.Union([Schema.String, Schema.Number, Schema.Boolean]);

export const RecipeSignalComparison = Schema.Struct({
  signal: Schema.Literals([...RECIPE_SIGNAL_KEYS]),
  eq: Schema.optional(RecipeSignalScalar),
  neq: Schema.optional(RecipeSignalScalar),
  gt: Schema.optional(Schema.Number),
  gte: Schema.optional(Schema.Number),
  lt: Schema.optional(Schema.Number),
  lte: Schema.optional(Schema.Number),
});
export type RecipeSignalComparison = typeof RecipeSignalComparison.Type;

export type RecipeSignalPredicate =
  | RecipeSignalComparison
  | { readonly all: ReadonlyArray<RecipeSignalPredicate> }
  | { readonly any: ReadonlyArray<RecipeSignalPredicate> }
  | { readonly not: RecipeSignalPredicate };

const RecipeSignalPredicateRef = Schema.suspend(
  (): Schema.Schema<RecipeSignalPredicate> => RecipeSignalPredicate,
);

export const RecipeSignalPredicate = Schema.Union([
  RecipeSignalComparison,
  Schema.Struct({ all: Schema.Array(RecipeSignalPredicateRef) }),
  Schema.Struct({ any: Schema.Array(RecipeSignalPredicateRef) }),
  Schema.Struct({ not: RecipeSignalPredicateRef }),
]);

export const recipeSignalPredicates = {
  workitemHasNoChildren: {
    signal: "workitem.hasChildren",
    neq: true,
  },
} as const satisfies Readonly<Record<string, RecipeSignalPredicate>>;

function evaluateComparison(
  predicate: RecipeSignalComparison,
  signals: RecipeMatchSignals | undefined,
): RecipePredicateResult {
  const actual = signals?.[predicate.signal as RecipeSignalKey];
  if (actual === undefined) {
    return "unknown";
  }

  if (predicate.eq !== undefined) {
    return actual === predicate.eq;
  }
  if (predicate.neq !== undefined) {
    return actual !== predicate.neq;
  }
  if (typeof actual !== "number") {
    return "unknown";
  }

  if (predicate.gt !== undefined && !(actual > predicate.gt)) {
    return false;
  }
  if (predicate.gte !== undefined && !(actual >= predicate.gte)) {
    return false;
  }
  if (predicate.lt !== undefined && !(actual < predicate.lt)) {
    return false;
  }
  if (predicate.lte !== undefined && !(actual <= predicate.lte)) {
    return false;
  }

  if (
    predicate.gt === undefined &&
    predicate.gte === undefined &&
    predicate.lt === undefined &&
    predicate.lte === undefined
  ) {
    return "unknown";
  }

  return true;
}

export function evaluateRecipeSignalPredicate(
  predicate: RecipeSignalPredicate,
  signals: RecipeMatchSignals | undefined,
): RecipePredicateResult {
  if ("all" in predicate) {
    let hasUnknown = false;
    for (const child of predicate.all) {
      const result = evaluateRecipeSignalPredicate(child, signals);
      if (result === false) {
        return false;
      }
      if (result === "unknown") {
        hasUnknown = true;
      }
    }
    return hasUnknown ? "unknown" : true;
  }

  if ("any" in predicate) {
    let hasUnknown = false;
    for (const child of predicate.any) {
      const result = evaluateRecipeSignalPredicate(child, signals);
      if (result === true) {
        return true;
      }
      if (result === "unknown") {
        hasUnknown = true;
      }
    }
    return hasUnknown ? "unknown" : false;
  }

  if ("not" in predicate) {
    const result = evaluateRecipeSignalPredicate(predicate.not, signals);
    if (result === "unknown") {
      return "unknown";
    }
    return !result;
  }

  return evaluateComparison(predicate, signals);
}

export function isRecipeSignalPredicateSatisfied(
  predicate: RecipeSignalPredicate | undefined,
  signals: RecipeMatchSignals | undefined,
): boolean {
  if (!predicate) {
    return true;
  }
  return evaluateRecipeSignalPredicate(predicate, signals) === true;
}
