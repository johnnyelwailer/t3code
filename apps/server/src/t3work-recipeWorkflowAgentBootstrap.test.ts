import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ThreadId } from "@t3tools/contracts";
import { T3workActionRecipeContext } from "@t3tools/project-context";
import type { ProjectRecipeWorkflowLaunch } from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.js";
import { upsertRecipeWorkflowAgentBootstrapContext } from "./t3work-recipeWorkflowAgentBootstrap.js";
import { workflowRunIdForThread } from "./t3work-recipeWorkflowRuntimeShared.js";

const encodeActionRecipeContextJson = Schema.encodeSync(
  Schema.fromJsonString(T3workActionRecipeContext),
);

function createMockOrchestration(commands: Array<unknown>): OrchestrationEngineShape {
  return {
    readEvents: () => Stream.empty,
    dispatch: (command) =>
      Effect.sync(() => {
        commands.push(command);
        return { sequence: commands.length };
      }),
    streamDomainEvents: Stream.empty,
  };
}

const TEST_LAUNCH: ProjectRecipeWorkflowLaunch = {
  kind: "recipe",
  recipeId: "create-recipe",
  title: "Create recipe",
  description: "Create a new recipe",
  source: "bundled",
  surface: "thread.context",
};

it.layer(NodeServices.layer)("upsertRecipeWorkflowAgentBootstrapContext", (it) => {
  it.effect(
    "records hidden provider-visible bootstrap context instead of leaking prompt material into a user turn",
    () =>
      Effect.gen(function* () {
        const commands: Array<any> = [];
        const fileSystem = yield* FileSystem.FileSystem;
        const threadId = ThreadId.make("thread-bootstrap");
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3work-bootstrap-test-",
        });
        const runRoot = `${workspaceRoot}/runs/${workflowRunIdForThread(threadId)}/recipe`;

        yield* fileSystem.makeDirectory(runRoot, { recursive: true });
        yield* fileSystem.writeFileString(
          `${runRoot}/prompt.md`,
          [
            "Draft the recipe from the current launch context.",
            "Call out the first artifact to create.",
          ].join("\n"),
        );
        yield* fileSystem.writeFileString(
          `${runRoot}/context.json`,
          encodeActionRecipeContextJson({
            surface: "thread.context",
            project: { title: "Project Alpha", provider: "atlassian" },
            workitem: {
              kind: "jira.issue",
              id: "ticket-123",
              displayId: "PROJ-123",
              title: "Fix import crash",
              provider: "atlassian",
              status: "In Progress",
              url: "https://example.test/browse/PROJ-123",
            },
            linkedResources: {
              state: "ready",
              items: [
                {
                  kind: "pull-request",
                  id: "42",
                  provider: "github",
                  label: "PR-42",
                  title: "Fix import crash",
                  url: "https://example.test/pull/42",
                },
              ],
            },
            artifacts: {
              state: "ready",
              items: [
                {
                  kind: "implementation-plan",
                  label: "Implementation plan",
                  path: ".t3work/artifacts/plan.md",
                },
              ],
            },
            profile: {
              technicalDepth: "medium",
              brevity: "balanced",
              guidanceStyle: "balanced",
              detailDensity: "balanced",
              preferredArtifactKinds: [],
              defaultActionFamilies: [],
              defaultRecipeWeights: {},
            },
            schema: {},
            enabledSkillPacks: [],
            availableContextKeys: { state: "ready", items: [] },
          }),
        );

        yield* upsertRecipeWorkflowAgentBootstrapContext({
          orchestration: createMockOrchestration(commands),
          threadId,
          workspaceRoot,
          launch: TEST_LAUNCH,
          stepId: "draft",
          createdAt: "2026-05-28T15:00:00.000Z",
          agentPromptText: "Read prompt.md and build the first draft.",
          userPromptText: "Create the first draft",
        });

        expect(commands).toHaveLength(1);
        expect(commands[0]).toMatchObject({
          type: "thread.message.upsert",
          message: {
            role: "system",
            t3workExt: {
              visibleToUser: false,
              visibleToAgent: true,
            },
          },
        });
        const messageText = (commands[0] as { message: { text: string } }).message.text;
        expect(messageText).toContain("Draft the recipe from the current launch context.");
        expect(messageText).not.toContain("recipe.json");
        expect(messageText).not.toContain("workflow-state.json");
        expect(messageText).not.toContain("runs/");
        expect(messageText).not.toMatch(/Read .* files/i);
        expect(commands[0].message.t3workExt.attachments).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "file",
              file: expect.objectContaining({
                label: "Recipe context (context.json)",
                mimeType: "application/json",
                url: expect.stringContaining("data:application/json;base64,"),
              }),
            }),
            expect.objectContaining({
              kind: "resource",
              resource: expect.objectContaining({
                ref: expect.objectContaining({
                  displayId: "PROJ-123",
                  title: "Fix import crash",
                }),
              }),
            }),
          ]),
        );
      }),
  );
});
