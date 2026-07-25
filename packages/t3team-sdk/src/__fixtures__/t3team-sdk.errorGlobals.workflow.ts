// Regression fixture: the error-class globals are bindable in a workflow body AND
// `instanceof Error` holds for them. Before the fix, the body realm had its own `Error`
// intrinsic (so engine errors failed `instanceof Error`) and `CancelledError` was not
// injected at all (a ReferenceError). Exercises reviewer findings F2 + G1.
import { Schema } from "effect";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  workflowErrorIsError: Schema.Boolean,
  cancelledIsCancelled: Schema.Boolean,
  cancelledIsError: Schema.Boolean,
  plainThrowIsError: Schema.Boolean,
});

export const meta = {
  name: "fixtures.error-globals",
  description: "Asserts error-class globals bind and instanceof Error holds in the body.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const workflowErrorIsError = new WorkflowError("we") instanceof Error;

let cancelledIsCancelled = false;
let cancelledIsError = false;
try {
  throw new CancelledError("cancelled");
} catch (e) {
  cancelledIsCancelled = e instanceof CancelledError;
  cancelledIsError = e instanceof Error;
}

let plainThrowIsError = false;
try {
  throw new Error("plain");
} catch (e) {
  plainThrowIsError = e instanceof Error;
}

return { workflowErrorIsError, cancelledIsCancelled, cancelledIsError, plainThrowIsError };
