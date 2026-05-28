import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { type OrchestrationCommand, ThreadId } from "@t3tools/contracts";
import {
  type ProjectRecipeWorkflowLaunch,
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION,
} from "@t3tools/project-recipes";
import { describe, expect, it } from "vitest";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.js";
import {
  runProjectRecipeWorkflowLaunch,
  resumeProjectRecipeWorkflowAfterAgentReply,
  submitProjectRecipeCardAction,
} from "./t3work-recipeWorkflowRuntime.js";

const CREATED_AT = "2026-05-27T12:00:00.000Z";

const PersistedWorkflowStateSnapshot = Schema.Struct({
  waitingFor: Schema.optional(
    Schema.Union([
      Schema.Struct({
        kind: Schema.Literal("card-action"),
        cardId: Schema.String,
        cardActivityStepId: Schema.String,
        actionId: Schema.String,
        card: Schema.Struct({
          title: Schema.String,
        }),
      }),
      Schema.Struct({
        kind: Schema.Literal("agent-message"),
        stepId: Schema.String,
      }),
    ]),
  ),
  nextStepIndex: Schema.Number,
});

const decodePersistedWorkflowStateSnapshot = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PersistedWorkflowStateSnapshot),
);

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

function activityAppendCommands(commands: ReadonlyArray<OrchestrationCommand>) {
  return commands.filter(
    (command): command is Extract<OrchestrationCommand, { type: "thread.activity.append" }> =>
      command.type === "thread.activity.append",
  );
}

function messageUpsertCommands(commands: ReadonlyArray<OrchestrationCommand>) {
  return commands.filter(
    (command): command is Extract<OrchestrationCommand, { type: "thread.message.upsert" }> =>
      command.type === "thread.message.upsert",
  );
}

const makeTempWorkspace = Effect.fn("makeTempWorkspace")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3work-recipe-workflow-",
  });
});

const writeRecipeWorkflowFixture = Effect.fn("writeRecipeWorkflowFixture")(function* (input: {
  readonly workspaceRoot: string;
}): Effect.fn.Return<
  {
    readonly recipeRoot: string;
    readonly workflowPath: string;
  },
  PlatformError.PlatformError,
  FileSystem.FileSystem
> {
  const fileSystem = yield* FileSystem.FileSystem;
  const recipeRoot = `${input.workspaceRoot}/.t3work/recipes/qa-test-plan`;

  yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
  yield* fileSystem.writeFileString(
    `${recipeRoot}/workflow.ts`,
    [
      "export const steps = [",
      '  { kind: "agent", id: "kickoff", promptText: "Kick off from workflow" },',
      '  { kind: "script", id: "present-card", module: "./recipe-script.ts#presentApproval" },',
      '  { kind: "await-card-action", id: "await-approve", actionId: "approve" },',
      '  { kind: "script", id: "finish", module: "./recipe-script.ts#finish" },',
      "];",
      "",
    ].join("\n"),
  );
  yield* fileSystem.writeFileString(
    `${recipeRoot}/recipe-script.ts`,
    [
      "export async function presentApproval(_ctx, api) {",
      "  await api.workflow.presentCard({",
      '    kind: "approval",',
      '    id: "approval-card",',
      '    title: "Approve QA launch",',
      '    body: "Approve the recipe workflow.",',
      '    actions: [{ id: "approve", label: "Approve" }],',
      "  });",
      "}",
      "",
      "export async function finish(_ctx, api) {",
      '  await api.workspace.writeText("artifacts/completed.txt", "done\\n");',
      "}",
      "",
    ].join("\n"),
  );

  return {
    recipeRoot,
    workflowPath: `${recipeRoot}/workflow.ts`,
  };
});

function buildLaunch(workflowPath: string, recipePath: string) {
  return {
    kind: "recipe",
    recipeId: "qa-test-plan",
    recipeVersion: "0.1.0",
    title: "Create QA plan",
    description: "Build a focused QA plan.",
    source: "project-local",
    surface: "workitem.detail.sidepanel",
    reason: "QA planning applies to bugs",
    recipePath,
    workflowPath,
    allowedToolGroups: ["integration.read"],
  } satisfies ProjectRecipeWorkflowLaunch;
}

describe("runProjectRecipeWorkflowLaunch", () => {
  it("loads workflow.ts, updates the card with an awaited action, and persists wait state", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          const { recipeRoot, workflowPath } = yield* writeRecipeWorkflowFixture({ workspaceRoot });
          const { orchestration, commands } = createMockOrchestration();
          const threadId = ThreadId.make("thread-recipe-runtime");

          const result = yield* runProjectRecipeWorkflowLaunch({
            orchestration,
            threadId,
            workspaceRoot,
            launch: buildLaunch(workflowPath, recipeRoot),
            kickoffMessage: "Original kickoff message",
            createdAt: CREATED_AT,
          });

          expect(result.kickoffMessage).toBe("Kick off from workflow");

          const fileSystem = yield* FileSystem.FileSystem;
          const stateJson = yield* fileSystem.readFileString(
            `${workspaceRoot}/.t3work/recipe-workflows/${threadId}.json`,
          );
          const state = yield* decodePersistedWorkflowStateSnapshot(stateJson);

          expect(state.waitingFor).toMatchObject({
            kind: "card-action",
            cardId: "approval-card",
            cardActivityStepId: "present-card",
            actionId: "approve",
            card: { title: "Approve QA launch" },
          });
          expect(state.nextStepIndex).toBe(3);

          const cardMessages = messageUpsertCommands(commands).filter(
            (command) =>
              command.message.t3workExt?.attachments?.some(
                (attachment) => attachment.kind === "view",
              ) === true,
          );
          expect(cardMessages).toHaveLength(2);
          expect(cardMessages[1]?.message.t3workExt?.attachments?.[0]).toMatchObject({
            props: {
              stepId: "present-card",
              phase: "updated",
              awaitingActionId: "approve",
            },
          });
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });
});

describe("resumeProjectRecipeWorkflowAfterAgentReply", () => {
  it("waits for a mid-flow agent reply before continuing to later present-message steps", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          const fileSystem = yield* FileSystem.FileSystem;
          const recipeRoot = `${workspaceRoot}/.t3work/recipes/create-recipe`;
          yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
          yield* fileSystem.writeFileString(
            `${recipeRoot}/workflow.ts`,
            [
              "export const steps = [",
              '  { kind: "present-message", id: "announce", message: { body: "Before agent" } },',
              '  { kind: "agent", id: "draft", promptText: "Draft the recipe" },',
              '  { kind: "present-message", id: "after-agent", message: { body: "After agent" } },',
              "];",
              "",
            ].join("\n"),
          );

          const { orchestration, commands } = createMockOrchestration();
          const threadId = ThreadId.make("thread-recipe-agent-resume");

          const launch = buildLaunch(`${recipeRoot}/workflow.ts`, recipeRoot);
          const launchResult = yield* runProjectRecipeWorkflowLaunch({
            orchestration,
            threadId,
            workspaceRoot,
            launch,
            kickoffMessage: "Start the create-recipe flow",
            createdAt: CREATED_AT,
          });

          expect(launchResult.turnStartMessage).toBe("Draft the recipe");

          const stateJson = yield* fileSystem.readFileString(
            `${workspaceRoot}/.t3work/recipe-workflows/${threadId}.json`,
          );
          const state = yield* decodePersistedWorkflowStateSnapshot(stateJson);
          expect(state.waitingFor).toMatchObject({
            kind: "agent-message",
            stepId: "draft",
          });
          expect(state.nextStepIndex).toBe(2);

          const resumed = yield* resumeProjectRecipeWorkflowAfterAgentReply({
            orchestration,
            workspaceRoot,
            threadId,
            messageText: "Here is the drafted recipe",
            createdAt: "2026-05-27T12:00:10.000Z",
          });

          expect(resumed?.turnStartMessage).toBeUndefined();
          const workflowStateExists = yield* fileSystem.exists(
            `${workspaceRoot}/.t3work/recipe-workflows/${threadId}.json`,
          );
          expect(workflowStateExists).toBe(false);

          const upserts = messageUpsertCommands(commands).filter(
            (command) => command.message.role === "system",
          );
          expect(upserts.map((command) => command.message.text)).toEqual([
            "Before agent",
            "After agent",
          ]);
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });
});

describe("submitProjectRecipeCardAction", () => {
  it("records the selected action, completes the card, resumes the workflow, and clears persisted state", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeTempWorkspace();
          const { recipeRoot, workflowPath } = yield* writeRecipeWorkflowFixture({ workspaceRoot });
          const { orchestration, commands } = createMockOrchestration();
          const threadId = ThreadId.make("thread-recipe-runtime");

          yield* runProjectRecipeWorkflowLaunch({
            orchestration,
            threadId,
            workspaceRoot,
            launch: buildLaunch(workflowPath, recipeRoot),
            kickoffMessage: "Original kickoff message",
            createdAt: CREATED_AT,
          });

          yield* submitProjectRecipeCardAction({
            orchestration,
            workspaceRoot,
            threadId,
            cardId: "approval-card",
            actionId: "approve",
            createdAt: "2026-05-27T12:00:05.000Z",
          });

          const fileSystem = yield* FileSystem.FileSystem;
          const workflowStateExists = yield* fileSystem.exists(
            `${workspaceRoot}/.t3work/recipe-workflows/${threadId}.json`,
          );
          const completedArtifact = yield* fileSystem.readFileString(
            `${recipeRoot}/artifacts/completed.txt`,
          );

          expect(workflowStateExists).toBe(false);
          expect(completedArtifact).toBe("done\n");

          const activities = activityAppendCommands(commands);
          expect(
            activities.some(
              (command) =>
                command.activity.kind === PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION &&
                (command.activity.payload as { actionId?: string }).actionId === "approve",
            ),
          ).toBe(true);
          expect(
            messageUpsertCommands(commands).some((command) => {
              const props = command.message.t3workExt?.attachments?.[0];
              if (!props || props.kind !== "view") {
                return false;
              }
              const payload = props.props as { phase?: string; completedActionId?: string };
              return payload.phase === "completed" && payload.completedActionId === "approve";
            }),
          ).toBe(true);
        }).pipe(Effect.provide(NodeServices.layer)),
      ),
    );
  });
});
