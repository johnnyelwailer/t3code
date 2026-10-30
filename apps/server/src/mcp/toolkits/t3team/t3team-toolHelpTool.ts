/**
 * `t3_tool_help`: the advertised tool text is minimal (`t3team-toolDocs.ts`), and this returns what
 * the registration carried: the full description and every schema field note for one tool.
 */
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { fieldDescriptionsByName, originalToolDocs } from "./t3team-toolDocs.ts";

export const T3TeamToolHelpTool = Tool.make("t3_tool_help", {
  description:
    "- full docs of one T3 tool: description, field notes\n- tool text in this list is minimal",
  parameters: Schema.Struct({ tool: Schema.String }),
  success: Schema.Struct({
    tool: Schema.String,
    description: Schema.String,
    fields: Schema.Record(Schema.String, Schema.String),
  }),
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  dependencies: [],
});

export const t3ToolHelpHandler = Effect.fn("T3TeamMcpToolkit.toolHelp")(function* (input: {
  readonly tool: string;
}) {
  const docs = originalToolDocs(input.tool);
  if (docs === undefined) {
    return yield* new T3TeamMcpToolError({ message: `No T3 tool named ${input.tool}.` });
  }
  return {
    tool: input.tool,
    description: docs.description ?? "",
    fields: fieldDescriptionsByName(docs.inputSchema),
  };
});
