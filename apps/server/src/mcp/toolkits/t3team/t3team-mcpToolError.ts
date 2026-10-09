import * as Schema from "effect/Schema";

/** The failure every t3team MCP tool reports; the message reaches the agent verbatim. */
export class T3TeamMcpToolError extends Schema.TaggedError<T3TeamMcpToolError>()(
  "T3TeamMcpToolError",
  { message: Schema.String },
) {}
