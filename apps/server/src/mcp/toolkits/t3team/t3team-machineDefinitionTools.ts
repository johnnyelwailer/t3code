/**
 * `t3_machine_find_definitions` (`t3team.machine.find_definitions`): an agent setting up a
 * project's machine asks what machine definitions already exist in the project's repositories, on
 * any branch or pull request, instead of asking the user for a repository and branch. Behavior
 * lives in `MachineDefinitionFinder`; this module resolves the calling thread's project and maps
 * errors. The description comes from the catalog.
 *
 * @module t3team-machineDefinitionTools
 */
import { OrchestratorMcpFailure, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { MachineDefinitionFinder } from "../../../project/t3team-MachineDefinitionFinder.ts";
import { MachineDefinitionSearchResult } from "../../../project/t3team-machineDefinitionSearchResult.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { readCaller, resolveProjectId } from "../../threadAccess.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

export const T3TeamMachineFindDefinitionsTool = Tool.make("t3_machine_find_definitions", {
  description: mcpDescriptionOf("t3team.machine.find_definitions"),
  parameters: Schema.Struct({
    projectId: Schema.optional(ProjectId).annotate({
      description: "The project to search. Default: this thread's project.",
    }),
  }),
  success: MachineDefinitionSearchResult,
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
});

/** The handler, with the finder resolved once when the toolkit layer is built (the server always
 * has it; a toolkit test layer without it gets a clear refusal). */
export const makeMachineFindDefinitionsHandler = Effect.gen(function* () {
  const finder = Option.getOrUndefined(yield* Effect.serviceOption(MachineDefinitionFinder));
  return Effect.fn("T3TeamMcpToolkit.findMachineDefinitions")(function* (input: {
    readonly projectId?: ProjectId | undefined;
  }) {
    if (!finder) {
      return yield* new T3TeamMcpToolError({
        message: "Machine definitions cannot be searched on this server.",
      });
    }
    // The calling thread's project, unless the agent names another one.
    const projectId = yield* resolveProjectId(yield* readCaller(), input.projectId);
    return yield* finder
      .find(projectId)
      .pipe(Effect.mapError((error) => new T3TeamMcpToolError({ message: error.message })));
  });
});
