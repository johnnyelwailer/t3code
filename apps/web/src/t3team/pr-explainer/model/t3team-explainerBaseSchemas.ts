import * as Schema from "effect/Schema";

/**
 * The few primitives the explainer model needs, kept here so the model has no dependency on the
 * host's contracts package.
 */
export const TrimmedNonEmptyString = Schema.String.check(
  Schema.makeFilter((value: string) => value.trim().length > 0 || "Must not be blank."),
);
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
/** An ISO-8601 timestamp, kept as text. */
export const IsoDateTime = Schema.String;
