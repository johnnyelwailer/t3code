/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vite-plus/test";
import { createQueryable } from "@t3tools/project-context";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { discoverProjectRecipes } from "./t3work-projectRecipeDiscovery.js";
import { makeBrokerLayer } from "./t3work-toolBrokerTestUtils.ts";

const makeTempWorkspace = Effect.fn("makeTempWorkspace")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3work-recipes-",
  });
});

const writeRecipe = Effect.fn("writeRecipe")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipeId: string;
  readonly recipeJson: string;
  readonly prompt: string;
  readonly actionViewMdx?: string;
  readonly visibleTs?: string;
  readonly workflowTs?: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const recipeRoot = path.join(input.workspaceRoot, ".t3work/recipes", input.recipeId);
  yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
  yield* fileSystem.writeFileString(path.join(recipeRoot, "recipe.json"), input.recipeJson);
  yield* fileSystem.writeFileString(path.join(recipeRoot, "prompt.md"), input.prompt);
  if (input.actionViewMdx) {
    yield* fileSystem.writeFileString(path.join(recipeRoot, "action.mdx"), input.actionViewMdx);
  }
  if (input.visibleTs) {
    yield* fileSystem.writeFileString(path.join(recipeRoot, "visible.ts"), input.visibleTs);
  }
  if (input.workflowTs) {
    yield* fileSystem.writeFileString(path.join(recipeRoot, "workflow.ts"), input.workflowTs);
  }
});

describe("discoverProjectRecipes", () => {
  it("discovers project-local recipes and evaluates visible.ts against the render context", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeRecipe({
            workspaceRoot,
            recipeId: "qa-test-plan",
            recipeJson: `{
  "id": "qa-test-plan",
  "version": "0.1.0",
  "scope": "project",
  "displayName": "Create QA plan for {{ workitem?.displayId ?? 'selected work' }}",
  "shortDescription": "Build a focused QA plan.",
  "surfaces": ["workitem.detail.sidepanel"],
  "prompt": "./prompt.md",
  "kickoff": {
    "version": 1,
    "steps": [
      {
        "kind": "wait-for-kickoff-input",
        "id": "collect-brief",
        "when": "missing-prompt",
        "promptRequest": {
          "title": "Recipe kickoff",
          "sections": ["context-summary"]
        }
      },
      {
        "kind": "run-interactive-agent",
        "id": "author"
      }
    ]
  },
  "actionView": "./action.mdx",
  "visibleWhen": "./visible.ts",
  "workflow": "./workflow.ts",
  "allowedToolGroups": ["integration.read"]
}`,
            prompt: "Plan tests for {{ workitem?.displayId ?? 'selected work' }}.",
            actionViewMdx: `
export default function Action({ ctx }) {
  return (
    <RecipeAction
      title={\`Create QA plan for \${ctx.workitem?.displayId ?? "selected work"}\`}
      subtitle={ctx.workitem?.type}
      icon="bug"
    >
      <FieldList
        items={[
          { label: "Priority", value: ctx.workitem?.priority ?? "Unknown" },
        ]}
      />
    </RecipeAction>
  );
}
`,
            visibleTs: `
export function visible(ctx) {
  return {
    visible: ctx.workitem?.type === "Bug",
    rank: ctx.workitem?.priority === "High" ? 95 : 70,
    reason: "QA planning applies to bugs",
  };
}
`,
            workflowTs: "export const steps = [];\n",
          });

          const bugResults = yield* discoverProjectRecipes({
            workspaceRoot,
            context: {
              surface: "workitem.detail.sidepanel",
              project: {
                title: "Project Alpha",
                provider: "atlassian",
              },
              workitem: {
                kind: "ticket",
                displayId: "ALPHA-42",
                type: "Bug",
                priority: "High",
                provider: "jira",
              },
              linkedResources: createQueryable([]),
              artifacts: createQueryable([]),
              profile: {
                technicalDepth: "medium",
                brevity: "balanced",
                guidanceStyle: "guided",
                detailDensity: "balanced",
                preferredArtifactKinds: ["test-matrix"],
                defaultActionFamilies: ["qa"],
                defaultRecipeWeights: {},
              },
              enabledSkillPacks: ["qa"],
              schema: {},
              availableContextKeys: createQueryable(["ticket.summary"]),
            },
          });

          expect(bugResults.hasProjectLocalRecipes).toBe(true);
          expect(bugResults.recipes).toHaveLength(1);
          expect(bugResults.recipes[0]).toMatchObject({
            id: "qa-test-plan",
            displayName: "Create QA plan for ALPHA-42",
            shortDescription: "Build a focused QA plan.",
            rank: 95,
            reason: "QA planning applies to bugs",
            prompt: "Plan tests for ALPHA-42.",
            kickoff: {
              version: 1,
              steps: [
                {
                  kind: "collect-input",
                  id: "collect-brief",
                  request: {
                    kind: "text",
                    when: "missing-prompt",
                    promptRequest: {
                      title: "Recipe kickoff",
                      sections: ["context-summary"],
                    },
                  },
                },
                {
                  kind: "agent",
                  id: "author",
                },
              ],
            },
            actionViewPath: expect.stringContaining("/qa-test-plan/action.mdx"),
            actionViewSource: expect.stringContaining("<RecipeAction"),
            sourcePath: expect.stringContaining("/qa-test-plan/recipe.json"),
            workflowPath: expect.stringContaining("/qa-test-plan/workflow.ts"),
          });

          const storyResults = yield* discoverProjectRecipes({
            workspaceRoot,
            context: {
              surface: "workitem.detail.sidepanel",
              project: {
                title: "Project Alpha",
                provider: "atlassian",
              },
              workitem: {
                kind: "ticket",
                displayId: "ALPHA-43",
                type: "Story",
                priority: "Medium",
                provider: "jira",
              },
              linkedResources: createQueryable([]),
              artifacts: createQueryable([]),
              profile: {
                technicalDepth: "medium",
                brevity: "balanced",
                guidanceStyle: "guided",
                detailDensity: "balanced",
                preferredArtifactKinds: ["test-matrix"],
                defaultActionFamilies: ["qa"],
                defaultRecipeWeights: {},
              },
              enabledSkillPacks: ["qa"],
              schema: {},
              availableContextKeys: createQueryable(["ticket.summary"]),
            },
          });

          expect(storyResults.hasProjectLocalRecipes).toBe(true);
          expect(storyResults.recipes).toEqual([]);
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("keeps bundled applicability behavior for starter recipes copied into project scope", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeRecipe({
            workspaceRoot,
            recipeId: "technical-implementation-plan",
            recipeJson: `{
  "id": "technical-implementation-plan",
  "version": "0.1.0",
  "scope": "project",
  "displayName": "Draft implementation plan for {{ workitem?.displayId ?? 'selected work' }}",
  "shortDescription": "Map impacted areas and validation.",
  "surfaces": ["workitem.detail.sidepanel"],
  "prompt": "./prompt.md"
}`,
            prompt:
              "Draft a concrete implementation plan for {{ workitem?.displayId ?? 'selected work' }}.",
          });

          const engineeringResults = yield* discoverProjectRecipes({
            workspaceRoot,
            context: {
              surface: "workitem.detail.sidepanel",
              project: {
                title: "Project Alpha",
                provider: "atlassian",
              },
              workitem: {
                kind: "ticket",
                displayId: "ALPHA-99",
                type: "Story",
              },
              linkedResources: createQueryable([]),
              artifacts: createQueryable([]),
              profile: {
                technicalDepth: "high",
                brevity: "balanced",
                guidanceStyle: "expert",
                detailDensity: "expert",
                preferredArtifactKinds: ["implementation-plan"],
                defaultActionFamilies: ["engineering"],
                defaultRecipeWeights: {},
              },
              enabledSkillPacks: ["engineering"],
              schema: {},
              availableContextKeys: createQueryable(["ticket.summary", "project.summary"]),
            },
          });

          expect(engineeringResults.recipes.map((recipe) => recipe.id)).toEqual([
            "technical-implementation-plan",
          ]);
          expect(engineeringResults.recipes[0]?.rank).toBeGreaterThan(0);

          const productResults = yield* discoverProjectRecipes({
            workspaceRoot,
            context: {
              surface: "workitem.detail.sidepanel",
              project: {
                title: "Project Alpha",
                provider: "atlassian",
              },
              workitem: {
                kind: "ticket",
                displayId: "ALPHA-100",
                type: "Story",
              },
              linkedResources: createQueryable([]),
              artifacts: createQueryable([]),
              profile: {
                technicalDepth: "low",
                brevity: "short",
                guidanceStyle: "guided",
                detailDensity: "guided",
                preferredArtifactKinds: ["status-update"],
                defaultActionFamilies: ["product"],
                defaultRecipeWeights: {},
              },
              enabledSkillPacks: ["product"],
              schema: {},
              availableContextKeys: createQueryable(["ticket.summary", "project.summary"]),
            },
          });

          expect(productResults.hasProjectLocalRecipes).toBe(true);
          expect(productResults.recipes).toEqual([]);
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("binds visible.ts to the no-thread read-only tool surface", async () => {
    const orchestrationMock: OrchestrationEngineShape = {
      readEvents: () => Stream.empty,
      dispatch: () => Effect.succeed({ sequence: 1 }),
      streamDomainEvents: Stream.empty,
    };

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeRecipe({
            workspaceRoot,
            recipeId: "triage-current-view",
            recipeJson: `{
  "id": "triage-current-view",
  "version": "0.1.0",
  "scope": "project",
  "displayName": "Prioritize {{ surfaceState?.dashboardMode ?? 'project' }}: {{ surfaceState?.currentView?.itemCount ?? 0 }} items",
  "shortDescription": "Top item: {{ contextAttachments?.[0]?.label ?? 'none' }}",
  "surfaces": ["project.dashboard.backlog"],
  "rank": "{{ surfaceState?.currentView?.bugCount === 1 ? 88 : 40 }}",
  "visibleWhen": "./visible.ts",
  "allowedToolGroups": ["integration.read"],
  "prompt": "./prompt.md"
}`,
            prompt: "Focus the current dashboard context.",
            visibleTs: `
export async function visible(_ctx, api) {
  const view = await api.tools.call("t3work.view.read");
  try {
    await api.tools.call("t3work.thread.rename", { title: "Nope" });
    return { visible: false };
  } catch (error) {
    return {
      visible:
        view.thread === null &&
        view.project?.workspaceRoot === "${workspaceRoot}" &&
        String(error instanceof Error ? error.message : error).includes("requires group 'view.state'"),
      reason: String(error instanceof Error ? error.message : error),
    };
  }
}
`,
          });

          const results = yield* discoverProjectRecipes({
            workspaceRoot,
            context: {
              surface: "project.dashboard.backlog",
              project: {
                title: "Project Alpha",
                provider: "atlassian",
              },
              linkedResources: createQueryable([]),
              artifacts: createQueryable([]),
              contextAttachments: createQueryable([
                {
                  kind: "jira-work-item",
                  label: "ALPHA-42 Fix import crash",
                  jiraIssueType: "Bug",
                },
              ]),
              surfaceState: {
                dashboardMode: "backlog",
                hasContextAttachments: true,
                hasSelectedWork: true,
                currentView: {
                  itemCount: 1,
                  bugCount: 1,
                  primaryItemLabel: "ALPHA-42",
                  primaryBugLabel: "ALPHA-42",
                },
              },
              profile: {
                technicalDepth: "medium",
                brevity: "balanced",
                guidanceStyle: "guided",
                detailDensity: "balanced",
                preferredArtifactKinds: ["priority-list"],
                defaultActionFamilies: ["delivery"],
                defaultRecipeWeights: {},
              },
              enabledSkillPacks: ["delivery"],
              schema: {},
              availableContextKeys: createQueryable([
                "project.summary",
                "dashboard.backlog.summary",
              ]),
            },
          });

          expect(results.recipes).toHaveLength(1);
          expect(results.recipes[0]).toMatchObject({
            id: "triage-current-view",
            displayName: "Prioritize backlog: 1 items",
            shortDescription: "Top item: ALPHA-42 Fix import crash",
            rank: 88,
            reason: expect.stringContaining("requires group 'view.state'"),
          });
        }).pipe(
          Effect.provide(Layer.mergeAll(makeBrokerLayer(orchestrationMock), NodeServices.layer)),
        ),
      ),
    );
  });

  it("supports bundled shorthand template aliases during project-local discovery", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeRecipe({
            workspaceRoot,
            recipeId: "create-contextual-recipe",
            recipeJson: `{
  "id": "create-contextual-recipe",
  "version": "0.1.0",
  "scope": "project",
  "displayName": "Create a recipe for {{surfaceAuthoringLabel}}",
  "shortDescription": "Prioritize {{currentViewLabel}}{{currentViewSummarySuffix}}",
  "surfaces": ["project.dashboard.backlog"],
  "prompt": "./prompt.md"
}`,
            prompt:
              "Author a recipe for {{surfaceAuthoringLabel}} in {{projectTitle}} using {{currentViewItemCount}} visible items.",
          });

          const results = yield* discoverProjectRecipes({
            workspaceRoot,
            context: {
              surface: "project.dashboard.backlog",
              project: {
                title: "Project Alpha",
                provider: "atlassian",
              },
              linkedResources: createQueryable([]),
              artifacts: createQueryable([]),
              surfaceState: {
                dashboardMode: "backlog",
                hasContextAttachments: false,
                hasSelectedWork: false,
                currentView: {
                  itemCount: 3,
                  bugCount: 1,
                  primaryItemLabel: "ALPHA-1",
                  primaryBugLabel: "ALPHA-2",
                },
              },
              profile: {
                technicalDepth: "medium",
                brevity: "balanced",
                guidanceStyle: "guided",
                detailDensity: "balanced",
                preferredArtifactKinds: ["implementation-plan"],
                defaultActionFamilies: ["delivery"],
                defaultRecipeWeights: {},
              },
              enabledSkillPacks: ["delivery"],
              schema: {},
              availableContextKeys: createQueryable([
                "project.summary",
                "dashboard.backlog.summary",
              ]),
            },
          });

          expect(results.recipes).toHaveLength(1);
          expect(results.recipes[0]).toMatchObject({
            id: "create-contextual-recipe",
            displayName: "Create a recipe for backlog view",
            shortDescription: "Prioritize pending work: 3 items, one bug (ALPHA-2)",
            prompt: "Author a recipe for backlog view in Project Alpha using 3 visible items.",
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });
});
