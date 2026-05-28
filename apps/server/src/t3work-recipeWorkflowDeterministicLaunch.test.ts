import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { type OrchestrationCommand } from "@t3tools/contracts";
import type { ProjectRecipeWorkflowLaunch } from "@t3tools/project-recipes";
import { describe, expect, it } from "vitest";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { runDeterministicProjectRecipeWorkflowLaunch } from "./t3work-recipeWorkflowRuntime.js";
import { makeBrokerLayer } from "./t3work-toolBrokerTestUtils.ts";

const CREATED_AT = "2026-05-28T14:00:00.000Z";

function createMockOrchestration() {
  const commands: OrchestrationCommand[] = [];
  const orchestration: OrchestrationEngineShape = {
    readEvents: () => Stream.empty,
    dispatch: (command) =>
      Effect.sync(() => {
        commands.push(command);
        return { sequence: commands.length };
      }),
    streamDomainEvents: Stream.empty,
  };

  return { orchestration, commands };
}

const makeTempWorkspace = Effect.fn("makeTempWorkspace")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3work-deterministic-workflow-",
  });
});

describe("runDeterministicProjectRecipeWorkflowLaunch", () => {
  it("runs a no-agent tool workflow through the broker without creating a thread", async () => {
    const { orchestration, commands } = createMockOrchestration();

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          const launch = {
            kind: "recipe",
            recipeId: "show-only-assigned-to-me",
            recipeVersion: "0.1.0",
            title: "Show only assigned to me",
            description: "Apply the visible assignee filter inline.",
            source: "bundled",
            surface: "project.dashboard.backlog",
            allowedToolGroups: ["view.state"],
            kickoff: {
              steps: [
                {
                  kind: "tool",
                  id: "apply-assignee-filter",
                  toolName: "t3work.backlog.set_assignee_filter",
                  input: { mode: "current-user" },
                },
              ],
            },
          } satisfies ProjectRecipeWorkflowLaunch;

          return yield* runDeterministicProjectRecipeWorkflowLaunch({
            workspaceRoot,
            launch,
            kickoffMessage: "",
            createdAt: CREATED_AT,
            toolContext: {
              surface: "t3work",
              tools: [
                {
                  id: "t3work.backlog.set_assignee_filter",
                  label: "Set backlog assignee filter",
                  capabilities: ["write"],
                },
              ],
              state: {
                view: {
                  kind: "project-dashboard-backlog",
                  projectId: "project-1",
                  projectTitle: "Project One",
                },
                backlog: {
                  state: {
                    assigneeFilter: "all",
                  },
                  currentUserDisplayName: "Pat Jones",
                },
              },
            },
          });
        }).pipe(Effect.provide(Layer.mergeAll(makeBrokerLayer(orchestration), NodeServices.layer))),
      ),
    );

    expect(commands).toEqual([]);
    expect(result.effects).toEqual([
      {
        kind: "view-state-patch",
        stepId: "apply-assignee-filter",
        toolName: "t3work.backlog.set_assignee_filter",
        statePatch: {
          assigneeFilter: "Pat Jones",
        },
        promptText: "The dashboard is now filtered to work assigned to Pat Jones.",
      },
    ]);
    expect(result.completionActivity).toEqual({
      title: "Show only assigned to me",
      description: "The dashboard is now filtered to work assigned to Pat Jones.",
      tone: "success",
    });
  });
});
