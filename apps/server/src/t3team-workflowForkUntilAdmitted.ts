/**
 * Runs a workflow launch detached from the caller and waits only for its admission, as
 * `launchDetachedWorkflow` does for tool launches: the run outlives the HTTP request by hours.
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

export class WorkflowAdmissionError extends Schema.TaggedError<WorkflowAdmissionError>()(
  "WorkflowAdmissionError",
  { message: Schema.String },
) {}

export const forkUntilAdmitted = Effect.fn("forkUntilAdmitted")(function* <A, E, R>(
  launch: (admitted: () => void) => Effect.Effect<A, E, R>,
) {
  let resolveAdmitted: () => void = () => undefined;
  let rejectAdmitted: (error: unknown) => void = () => undefined;
  const admitted = new Promise<void>((resolve, reject) => {
    resolveAdmitted = resolve;
    rejectAdmitted = reject;
  });
  yield* launch(() => resolveAdmitted()).pipe(
    // A launch that ends before admitting (refused, failed, died) must not hang the caller.
    Effect.onExit((exit) =>
      Effect.sync(() =>
        Exit.isFailure(exit) ? rejectAdmitted(Cause.squash(exit.cause)) : resolveAdmitted(),
      ),
    ),
    Effect.forkDetach({ startImmediately: true }),
  );
  yield* Effect.tryPromise({
    try: () => admitted,
    catch: (cause) =>
      new WorkflowAdmissionError({
        message: cause instanceof Error ? cause.message : "The workflow run was not admitted.",
      }),
  });
});
