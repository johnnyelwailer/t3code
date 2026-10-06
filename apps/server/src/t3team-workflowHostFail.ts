/**
 * The workflow host's one error type and the wrapper that maps any host write failure onto it
 * (split from `t3team-workflowHost.ts` for the additive size budget).
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class T3TeamWorkflowHostError extends Schema.TaggedError<T3TeamWorkflowHostError>()(
  "T3TeamWorkflowHostError",
  { operation: Schema.String, message: Schema.String },
) {}

const describe = (cause: unknown): string =>
  typeof cause === "object" && cause !== null && "message" in cause
    ? String((cause as { readonly message: unknown }).message)
    : String(cause);

export const failAs =
  (operation: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<void, T3TeamWorkflowHostError, R> =>
    effect.pipe(
      Effect.asVoid,
      Effect.mapError(
        (cause) => new T3TeamWorkflowHostError({ operation, message: describe(cause) }),
      ),
      Effect.withSpan(`t3team.workflowHost.${operation}`),
    );
