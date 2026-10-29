/**
 * `t3_machine_set_source` (`t3team.machine.set_source`): the machine-setup agent proposes the
 * repository and branch that hold a project's machine definition. The tool only proposes. The
 * setting lives on the user's own environment, so the question it posts (`t3_ask_user`'s docked
 * card) is what applies it: the web client saves it when the user accepts. The handler is in
 * `t3team-machineSourceHandler`; the description comes from the catalog.
 *
 * @module t3team-machineSourceTools
 */
import { OrchestratorMcpFailure, RuntimeRequestId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamAskUserWriter } from "./t3team-askUserWriter.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

export const T3TeamMachineSetSourceTool = Tool.make("t3_machine_set_source", {
  description: mcpDescriptionOf("t3team.machine.set_source"),
  parameters: Schema.Struct({
    repository: Schema.String.annotate({
      description: "The repository: owner/repo on this project's host, or an https URL.",
    }),
    branch: Schema.optional(Schema.String).annotate({
      description: "The branch holding the definition. Default: the repository's default branch.",
    }),
    why: Schema.String.annotate({
      description: "One or two sentences the user reads: why this repository and branch.",
    }),
    author: Schema.optional(Schema.String).annotate({
      description: "Who wrote the definition, when known (from t3_machine_find_definitions).",
    }),
  }),
  success: Schema.Struct({
    asked: Schema.Literal(true),
    requestId: RuntimeRequestId,
    questionId: Schema.String,
    repository: Schema.String.annotate({ description: "owner/repo" }),
    branch: Schema.NullOr(Schema.String),
    note: Schema.String,
  }),
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    T3TeamAskUserWriter,
  ],
});
