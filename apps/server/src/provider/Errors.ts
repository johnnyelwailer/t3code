import * as Schema from "effect/Schema";

export class ProviderInstanceNotFoundError extends Schema.TaggedError<ProviderInstanceNotFoundError>()(
  "ProviderInstanceNotFoundError",
  {
    instanceId: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `No provider instance bound to id '${this.instanceId}'`;
  }
}

export { ProviderDriverError } from "@t3tools/provider-core/server/errors";

export class ProviderWorkspaceMissingError extends Schema.TaggedError<ProviderWorkspaceMissingError>()(
  "ProviderWorkspaceMissingError",
  {
    threadId: Schema.String,
    cwd: Schema.String,
  },
) {
  override get message(): string {
    return `This thread's workspace folder no longer exists or is not a directory: ${this.cwd}. Restore the folder at this path before retrying.`;
  }
}

/**
 * ProviderJobControlUnsupportedError - The thread's runtime exposes no
 * out-of-band background-job control. Not a failure: callers map it to a
 * plain "unsupported" result and hide their affordances, so the route never
 * turns it into an error response.
 */
export class ProviderJobControlUnsupportedError extends Schema.TaggedError<ProviderJobControlUnsupportedError>()(
  "ProviderJobControlUnsupportedError",
  {
    threadId: Schema.String,
  },
) {
  override get message(): string {
    return `This runtime does not support background-job control for ${this.threadId}`;
  }
}
