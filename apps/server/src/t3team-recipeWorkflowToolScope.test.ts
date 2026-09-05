/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Bridges the launch API once, like its siblings. */
// @effect-diagnostics nodeBuiltinImport:off - writes real recipe modules into a temp workspace.
/**
 * The host-tool scope must come from the RECIPE, not from the launch request.
 *
 * Every live caller of the launch route fills `allowedToolGroups` by echoing the recipe's own
 * declaration, so nothing today relies on a caller narrowing itself — but a caller that OMITS the
 * field would previously have been granted unrestricted scope, which makes the restriction opt-in.
 * These cases pin the authority on the recipe module and pin every unresolvable case to `denied`.
 *
 * The recipes here are real modules, really `import()`ed. They are written under the repo's
 * gitignored `.t3team-runs/` rather than the OS temp dir on purpose: `vp test` runs through
 * vite-plus, which owns module resolution, so the Node `registerHooks` fallback in
 * `t3team-projectRecipeModuleResolution.ts` does not apply under the runner (that module's own
 * header says so). Inside the repo, `@t3team/sdk` resolves by walking up. Consequence worth
 * stating: this proves the SCOPE RULE, not real-world module resolution from a user's workspace.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { makeBrokerLayer } from "./t3team-toolBrokerTestLayers.ts";
import { createThreadToolContext, threadId } from "./t3team-toolBrokerTestUtils.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeT3TeamWorkflowHostDraftToolClient } from "./t3team-workflowHostDraftTools.ts";
import { resolveRecipeHostToolScope } from "./t3team-recipeWorkflowToolScope.ts";

// `<apps/server>/.t3team-runs/` — gitignored, so a crashed run cannot leave files the additive
// guard would report as new unprefixed sources.
const runsRoot = NodePath.join(
  NodeURL.fileURLToPath(new URL("..", import.meta.url)),
  ".t3team-runs",
);
// Created here, not assumed: the directory is gitignored, so a fresh clone or worktree does not
// have it and `mkdtemp` would fail with ENOENT before a single test ran.
NodeFS.mkdirSync(runsRoot, { recursive: true });
const root = NodeFS.mkdtempSync(NodePath.join(runsRoot, "scope-fixtures-"));
afterAll(() => NodeFS.rmSync(root, { recursive: true, force: true }));

const WORKFLOW_BODY = `import { Schema } from "effect";
import { getTools } from "@t3team/sdk";
export const Inputs = Schema.Struct({});
export const meta = { name: "scope.probe", inputs: Inputs, capabilities: ["mutation.draft"] } as const;
export default async function run() {
  await getTools().t3team.workItem.description.draftUpdate({ issue_id: "T3-5", body: "scoped" });
  return { ok: true };
}
`;

/** A real recipe directory: `recipe.ts` + the workflow it declares. */
function writeRecipe(input: {
  readonly id: string;
  readonly allowedToolGroups?: ReadonlyArray<string>;
}): { readonly recipePath: string; readonly workflowPath: string } {
  const recipePath = NodePath.join(root, input.id);
  NodeFS.mkdirSync(recipePath, { recursive: true });
  NodeFS.writeFileSync(NodePath.join(recipePath, "workflow.ts"), WORKFLOW_BODY, "utf8");
  NodeFS.writeFileSync(
    NodePath.join(recipePath, "recipe.ts"),
    `import { defineRecipe, defineWorkflow } from "@t3team/sdk";
import type * as Workflow from "./workflow.ts";

export default defineRecipe({
  id: ${JSON.stringify(input.id)},
  version: "0.1.0",
  scope: "project",
  title: ${JSON.stringify(input.id)},
  shortDescription: "Scope fixture.",
  surfaces: ["workitem.detail.sidepanel"],
${
  input.allowedToolGroups === undefined
    ? ""
    : `  allowedToolGroups: ${JSON.stringify(input.allowedToolGroups)},\n`
}  defaultAction: defineWorkflow<typeof Workflow>("./workflow.ts"),
});
`,
    "utf8",
  );
  return { recipePath, workflowPath: NodePath.join(recipePath, "workflow.ts") };
}

const narrow = writeRecipe({ id: "narrow-recipe", allowedToolGroups: ["integration.read"] });
const granting = writeRecipe({
  id: "granting-recipe",
  allowedToolGroups: ["integration.read", "mutation.draft"],
});
const undeclared = writeRecipe({ id: "undeclared-recipe" });

const TestLayer = NodeServices.layer;

const brokerDispatched: OrchestrationCommand[] = [];
const brokerEngineMock: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: (command) => {
    brokerDispatched.push(command);
    return Effect.succeed({ sequence: brokerDispatched.length });
  },
  streamDomainEvents: Stream.empty,
  subscribeDomainEvents: Effect.acquireRelease(Effect.succeed(Stream.empty), () => Effect.void),
  latestSequence: Effect.succeed(0),
};
const EndToEndLayer = Layer.mergeAll(NodeServices.layer, makeBrokerLayer(brokerEngineMock));

/** Resolve the recipe's scope, wire a bridge with exactly that, and run its workflow. */
const runUnderRecipeScope = Effect.fn("runUnderRecipeScope")(function* (input: {
  readonly runId: string;
  readonly recipe: { readonly recipePath: string; readonly workflowPath: string };
}) {
  const broker = yield* T3TeamToolBroker;
  yield* broker.bindSession({
    threadId,
    toolContext: createThreadToolContext({
      tools: [
        {
          id: "t3team.work_item.description.draft_update",
          label: "Draft description",
          capabilities: ["write"],
        },
      ],
    }),
  });

  const scope = yield* resolveRecipeHostToolScope(input.recipe);
  const client =
    scope.kind === "granted"
      ? makeT3TeamWorkflowHostDraftToolClient({
          broker,
          launchThreadId: threadId,
          allowedToolGroups: scope.toolGroups,
        })
      : undefined;

  const errors: unknown[] = [];
  let seq = 0;
  const result = yield* Effect.promise(() =>
    launchWorkflowRecipe({
      runId: input.runId,
      workflowPath: input.recipe.workflowPath,
      args: {},
      runsRoot: root,
      launchThreadId: threadId,
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      dispatch: async () => undefined,
      newId: () => `${input.runId}-id-${(seq += 1)}`,
      nowIso: () => "2026-07-27T00:00:00.000Z",
      ...(client === undefined ? {} : { hostToolClient: client }),
      onError: async (error) => {
        errors.push(error);
      },
    }),
  );
  return { result, errors };
});

it.effect("end to end: the manifest's scope is what actually gates the body's draft call", () =>
  Effect.gen(function* () {
    brokerDispatched.length = 0;

    // Narrow recipe: declares reads only, so its own workflow's draft call is refused even though
    // the body declares `mutation.draft`.
    const refused = yield* runUnderRecipeScope({ runId: "scope-e2e-narrow", recipe: narrow });
    assert.strictEqual(refused.result.status, "failed");
    assert.include(String(refused.errors[0]), "requires group 'mutation.draft'");
    assert.isTrue(
      brokerDispatched.every(
        (command) =>
          command.type !== "thread.message.upsert" ||
          !(command.message.t3teamExt?.attachments ?? []).some(
            (entry) => entry.kind === "draft-mutation",
          ),
      ),
      "no draft may be published under a read-only scope",
    );

    // Granting recipe: same body, same request (which supplies nothing), draft goes through.
    const allowed = yield* runUnderRecipeScope({ runId: "scope-e2e-granting", recipe: granting });
    assert.strictEqual(allowed.result.status, "completed");
    assert.isTrue(
      brokerDispatched.some(
        (command) =>
          command.type === "thread.message.upsert" &&
          (command.message.t3teamExt?.attachments ?? []).some(
            (entry) => entry.kind === "draft-mutation",
          ),
      ),
      "the granting recipe's scope must let the draft through",
    );
  }).pipe(Effect.provide(EndToEndLayer)),
);

it.effect("takes the manifest's scope, never a wider scope the request might claim", () =>
  Effect.gen(function* () {
    // The resolver's signature has no seat for a request value at all — the manifest is the only
    // input — so a caller claiming `mutation.draft` here cannot widen past `integration.read`.
    const scope = yield* resolveRecipeHostToolScope({
      recipePath: narrow.recipePath,
      workflowPath: narrow.workflowPath,
    });
    assert.deepStrictEqual(scope, { kind: "granted", toolGroups: ["integration.read"] });
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("a launch that omits allowedToolGroups still gets the manifest's scope", () =>
  Effect.gen(function* () {
    // The no-op case that mattered: nothing is supplied by the caller, yet the scope is real.
    const scope = yield* resolveRecipeHostToolScope({
      recipePath: granting.recipePath,
      workflowPath: granting.workflowPath,
    });
    assert.deepStrictEqual(scope, {
      kind: "granted",
      toolGroups: ["integration.read", "mutation.draft"],
    });
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("a recipe declaring no groups grants an EMPTY scope, which admits nothing", () =>
  Effect.gen(function* () {
    const scope = yield* resolveRecipeHostToolScope({
      recipePath: undeclared.recipePath,
      workflowPath: undeclared.workflowPath,
    });
    // Empty, never undefined: `normalizeProjectRecipeToolGroups([])` admits no tool, whereas
    // `undefined` would mean unrestricted.
    assert.deepStrictEqual(scope, { kind: "granted", toolGroups: [] });
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("resolves a literal `~`-prefixed recipePath/workflowPath", () =>
  Effect.gen(function* () {
    // Workspace entries may legitimately persist a home-relative `~` root (see
    // apps/server/src/workspace/WorkspacePaths.ts); the launch route passes it through
    // faithfully, so this resolver must expand it itself rather than fail closed on a path
    // fs.exists can never find. `path.relative` + `path.join` round-trips exactly back to the
    // real fixture path regardless of whether it happens to sit under the real home directory,
    // so this never touches the real `$HOME`. Plain string concatenation (not `path.join`) is
    // load-bearing: joining "~" with a relative path that starts with ".." would normalize the
    // two away into a `~`-less path, defeating the whole point of this fixture.
    const toTildePath = (absolutePath: string) =>
      `~/${NodePath.relative(NodeOS.homedir(), absolutePath)}`;
    const scope = yield* resolveRecipeHostToolScope({
      recipePath: toTildePath(narrow.recipePath),
      workflowPath: toTildePath(narrow.workflowPath),
    });
    assert.deepStrictEqual(scope, { kind: "granted", toolGroups: ["integration.read"] });
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("fails closed when the manifest cannot be resolved", () =>
  Effect.gen(function* () {
    const missingModule = NodePath.join(root, "no-module");
    NodeFS.mkdirSync(missingModule, { recursive: true });

    const broken = NodePath.join(root, "broken-recipe");
    NodeFS.mkdirSync(broken, { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(broken, "recipe.ts"),
      'throw new Error("boom");\nexport default {};\n',
      "utf8",
    );

    for (const [label, input] of [
      ["no recipePath", { recipePath: undefined, workflowPath: narrow.workflowPath }],
      [
        "no recipe.ts (legacy manifest form)",
        { recipePath: missingModule, workflowPath: NodePath.join(missingModule, "workflow.ts") },
      ],
      [
        "module throws on import",
        { recipePath: broken, workflowPath: NodePath.join(broken, "workflow.ts") },
      ],
      [
        "workflow is not one of the recipe's declared actions",
        { recipePath: narrow.recipePath, workflowPath: granting.workflowPath },
      ],
    ] as const) {
      const scope = yield* resolveRecipeHostToolScope(input);
      assert.strictEqual(scope.kind, "denied", `expected '${label}' to fail closed`);
    }
  }).pipe(Effect.provide(TestLayer)),
);
