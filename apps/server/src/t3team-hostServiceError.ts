import * as Schema from "effect/Schema";

export class HostServiceError extends Schema.TaggedError<HostServiceError>()("HostServiceError", {
  message: Schema.String,
}) {}

export const hostServiceError = (cause: unknown) =>
  new HostServiceError({
    message: cause instanceof Error ? cause.message : String(cause),
  });
