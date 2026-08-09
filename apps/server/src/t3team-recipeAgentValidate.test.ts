/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { describe, expect, it } from "vite-plus/test";

import { validateProjectRecipeWorkflowForAgent } from "./t3team-recipeAgentValidate.ts";
import { validateInlineWorkflowSourceForAgent } from "./t3team-recipeAgentValidateStatic.ts";

// Temp workspaces live under `__fixtures__` (not the OS tmpdir) so a typed `recipe.ts`'s
// `import("@t3team/sdk")` resolves via the monorepo's node_modules chain, the same way
// `t3team-projectRecipeDiscoveryModule.test.ts` does.
const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const makeTempWorkspace = Effect.fn("makeTempWorkspace")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    directory: fixturesRoot,
    prefix: "t3team-recipe-agent-validate-",
  });
});

const VALID_WORKFLOW = [
  `import { Schema } from "effect";`,
  ``,
  `export const Inputs = Schema.Struct({ prTitle: Schema.String });`,
  `export const Outputs = Schema.Struct({ summary: Schema.String });`,
  ``,
  `export const meta = {`,
  `  name: "agent-validate.valid",`,
  `  description: "Summarize a PR title.",`,
  `  inputs: Inputs,`,
  `  outputs: Outputs,`,
  `  capabilities: ["user"],`,
  `  phases: [{ title: "Review" }],`,
  `} as const;`,
  ``,
  `phase("Review");`,
  `const input = Schema.decodeSync(Inputs)(args);`,
  `const review = await agent(\`Summarize the risk of: \${input.prTitle}\`);`,
  `return { summary: review };`,
].join("\n");

const BROKEN_META_WORKFLOW = [
  `// meta is present but missing the required 'name' field, so extraction fails.`,
  `export const meta = { description: "no name here" } as const;`,
  `return { done: true };`,
].join("\n");

const writeWorkspaceFile = Effect.fn("writeWorkspaceFile")(function* (input: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly content: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolutePath = path.join(input.workspaceRoot, input.relativePath);
  yield* fileSystem.makeDirectory(path.dirname(absolutePath), { recursive: true });
  yield* fileSystem.writeFileString(absolutePath, input.content);
});

describe("validateProjectRecipeWorkflowForAgent", () => {
  it("validates a well-formed .workflow.ts with meta and shape populated", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/valid/valid.workflow.ts",
            content: VALID_WORKFLOW,
          });

          const result = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: ".t3team/recipes/valid/valid.workflow.ts",
          });

          expect(result.ok).toBe(true);
          expect(result.errors).toEqual([]);
          expect(result.workflowPath).toEqual(expect.stringContaining("/valid/valid.workflow.ts"));
          expect(result.meta).toMatchObject({
            name: "agent-validate.valid",
            description: "Summarize a PR title.",
            capabilities: ["user"],
            inputFields: ["prTitle"],
            outputFields: ["summary"],
            phases: [{ title: "Review" }],
          });
          expect(result.shape).toMatchObject({
            name: "agent-validate.valid",
            phases: [{ title: "Review" }],
            steps: [{ phase: "Review", kind: "agent" }],
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("reports a structured 'meta' issue when meta.name is missing", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/broken/broken.workflow.ts",
            content: BROKEN_META_WORKFLOW,
          });

          const result = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: ".t3team/recipes/broken/broken.workflow.ts",
          });

          expect(result.ok).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]).toMatchObject({
            phase: "meta",
            message: expect.stringContaining("meta.name"),
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("rejects a relative path that escapes the workspace root", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();

          const result = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: "../../etc/passwd",
          });

          expect(result.ok).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]).toMatchObject({
            phase: "discover",
            message: expect.stringContaining("Paths must stay inside the project workspace root"),
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("rejects an absolute path that resolves outside the workspace root", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();

          const result = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: "/etc/passwd",
          });

          expect(result.ok).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]).toMatchObject({
            phase: "discover",
            message: expect.stringContaining("Paths must stay inside the project workspace root"),
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("resolves a recipe DIRECTORY's workflow through a typed recipe.ts", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/typed-dir/typed-dir.workflow.ts",
            content: VALID_WORKFLOW,
          });
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/typed-dir/recipe.ts",
            content: [
              `import { defineRecipe, defineWorkflow } from "@t3team/sdk";`,
              `export default defineRecipe({`,
              `  id: "typed-dir",`,
              `  version: "0.1.0",`,
              `  scope: "project",`,
              `  title: "Typed dir recipe",`,
              `  shortDescription: "A typed recipe directory.",`,
              `  surfaces: ["project.dashboard.backlog"],`,
              `  appliesTo: {},`,
              `  allowedToolGroups: [],`,
              `  defaultAction: defineWorkflow("./typed-dir.workflow.ts"),`,
              `});`,
            ].join("\n"),
          });

          const result = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: ".t3team/recipes/typed-dir",
          });

          expect(result.ok).toBe(true);
          expect(result.workflowPath).toEqual(
            expect.stringContaining("/typed-dir/typed-dir.workflow.ts"),
          );
          expect(result.meta).toMatchObject({ name: "agent-validate.valid" });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("resolves a recipe DIRECTORY's workflow through a legacy recipe.json", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/legacy-dir/legacy-dir.workflow.ts",
            content: VALID_WORKFLOW,
          });
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/legacy-dir/prompt.md",
            content: "Do the thing.",
          });
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/legacy-dir/recipe.json",
            content: `{
  "id": "legacy-dir",
  "version": "0.1.0",
  "scope": "project",
  "displayName": "Legacy dir recipe",
  "shortDescription": "A legacy recipe directory.",
  "surfaces": ["project.dashboard.backlog"],
  "prompt": "./prompt.md",
  "workflow": "./legacy-dir.workflow.ts"
}`,
          });

          const result = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: ".t3team/recipes/legacy-dir",
          });

          expect(result.ok).toBe(true);
          expect(result.workflowPath).toEqual(
            expect.stringContaining("/legacy-dir/legacy-dir.workflow.ts"),
          );
          expect(result.meta).toMatchObject({ name: "agent-validate.valid" });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  it("reports a 'discover' issue for a recipe directory with neither recipe.ts nor recipe.json", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const emptyDir = path.join(workspaceRoot, ".t3team/recipes/empty-dir");
          yield* fileSystem.makeDirectory(emptyDir, { recursive: true });

          const result = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: ".t3team/recipes/empty-dir",
          });

          expect(result.ok).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]).toMatchObject({
            phase: "discover",
            message: expect.stringContaining(
              "Recipe directory has neither recipe.ts nor recipe.json.",
            ),
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });

  // A prompt-only recipe (definePrompt) has no workflow, so validate must say that plainly rather
  // than report a missing file for a path that was never supposed to exist.
  it("reports that a prompt-only recipe directory has no workflow to validate", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/prompt-dir/prompt.md",
            content: "Do the thing.",
          });
          yield* writeWorkspaceFile({
            workspaceRoot,
            relativePath: ".t3team/recipes/prompt-dir/recipe.ts",
            content: [
              `import { definePrompt, defineRecipe } from "@t3team/sdk";`,
              `export default defineRecipe({`,
              `  id: "prompt-dir",`,
              `  version: "0.1.0",`,
              `  scope: "project",`,
              `  title: "Prompt dir recipe",`,
              `  shortDescription: "A prompt-only recipe directory.",`,
              `  surfaces: ["project.dashboard.backlog"],`,
              `  defaultAction: definePrompt("./prompt.md"),`,
              `});`,
            ].join("\n"),
          });

          const result = yield* validateProjectRecipeWorkflowForAgent({
            workspaceRoot,
            path: ".t3team/recipes/prompt-dir",
          });

          expect(result.ok).toBe(false);
          expect(result.errors[0]).toMatchObject({
            phase: "discover",
            message: expect.stringContaining("prompt action"),
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });
});

describe("validateInlineWorkflowSourceForAgent", () => {
  it("validates a well-formed inline workflow source with meta and shape populated", () => {
    const result = validateInlineWorkflowSourceForAgent(VALID_WORKFLOW);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.workflowPath).toBe("<inline>");
    expect(result.meta).toMatchObject({
      name: "agent-validate.valid",
      description: "Summarize a PR title.",
      capabilities: ["user"],
      inputFields: ["prTitle"],
      outputFields: ["summary"],
      phases: [{ title: "Review" }],
    });
    expect(result.shape).toMatchObject({
      name: "agent-validate.valid",
      phases: [{ title: "Review" }],
      steps: [{ phase: "Review", kind: "agent" }],
    });
  });

  it("bounds hostile meta-head execution instead of hanging (vm timeout)", () => {
    const source = ["while (true) {}", 'export const meta = { name: "hostile" };'].join("\n");

    // @effect-diagnostics-next-line globalDate:off - Asserts a REAL vm timeout bounds hostile source; a test Clock would defeat the assertion.
    const start = Date.now();
    const result = validateInlineWorkflowSourceForAgent(source);
    // @effect-diagnostics-next-line globalDate:off - Asserts a REAL vm timeout bounds hostile source; a test Clock would defeat the assertion.
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(false);
    expect(elapsed).toBeLessThan(10_000);
    expect(result.errors.some((error) => error.phase === "meta")).toBe(true);
  });

  it("reports a structured 'meta' issue for inline source with garbage/missing meta", () => {
    const result = validateInlineWorkflowSourceForAgent(BROKEN_META_WORKFLOW);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      phase: "meta",
      message: expect.stringContaining("meta.name"),
    });
  });
});
