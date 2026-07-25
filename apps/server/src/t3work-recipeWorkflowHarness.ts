// @effect-diagnostics nodeBuiltinImport:off - the harness materializes temp run roots on disk.
/**
 * Recipe/orchestration E2E harness (Epic 25 §Host wiring).
 *
 * Launches a real recipe workflow against a fixture-backed project on the REAL engine +
 * resume reactor, with the model stubbed at the provider seam, and reports what actually
 * happened: phases, `scripts.*` calls, emitted widgets, asks answered, the durable
 * `workflow_runs` row and the run's return value. Browser-free, network-free, so it runs in CI.
 */
import {
  CommandId,
  type OrchestrationCommand,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { seedT3workFixtureProject } from "./t3work-fixtureProjectSeed.ts";
import {
  summarizeT3workHarnessCommands,
  type T3workRecipeHarnessReport,
} from "./t3work-recipeWorkflowHarnessReport.ts";
import {
  answerT3workRecipeHarnessAsk,
  makeT3workRecipeHarnessStubProvider,
  type T3workRecipeHarnessCapture,
} from "./t3work-recipeWorkflowHarnessStub.ts";
import { loadT3workRecipeHarnessRecipe } from "./t3work-recipeWorkflowHarnessRecipe.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3work-workflowEngineDurability.ts";
import { launchWorkflowRecipe } from "./t3work-workflowEngineLaunch.ts";
import { T3workWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";

const ISO = "2026-07-20T08:00:00.000Z";

export type T3workRecipeHarnessSpec = {
  /** Directory holding the recipe module (`recipe.ts`) and its `workflow.ts`. */
  readonly recipeDir: string;
  /** Fixture directory ingested into the harness workspace before the launch. */
  readonly fixtureRoot: string;
  /** Deterministic assistant replies, one per agent turn, in order. */
  readonly replies: ReadonlyArray<string>;
  /** Deterministic answers for each `askUser`, in order. */
  readonly answers?: ReadonlyArray<string>;
  readonly args?: unknown;
  readonly timeoutMs?: number;
  /** Shared capture so a caller (the CLI runner) sees the same commands/prompts. */
  readonly capture?: T3workRecipeHarnessCapture;
};

const waitUntil = (predicate: () => boolean, label: string, timeoutMs: number) =>
  Effect.gen(function* () {
    // Clock, not Date.now: Effect code reads time through the Clock service, and the
    // repo's effect diagnostics enforce it.
    const start = yield* Clock.currentTimeMillis;
    while ((yield* Clock.currentTimeMillis) - start < timeoutMs) {
      if (predicate()) return true;
      yield* Effect.sleep(Duration.millis(10));
    }
    return yield* Effect.die(new Error(`harness timed out waiting for: ${label}`));
  });

export function runT3workRecipeWorkflowHarness(spec: T3workRecipeHarnessSpec) {
  return Effect.gen(function* () {
    const timeoutMs = spec.timeoutMs ?? 20_000;
    const orchestration = yield* OrchestrationEngineService;
    const registry = yield* T3workWorkflowEngineRegistry;
    const runRepository = yield* WorkflowRunRepository;
    const recipe = yield* Effect.promise(() => loadT3workRecipeHarnessRecipe(spec.recipeDir));

    const workspaceRoot = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "t3work-recipe-e2e-ws-"),
    );
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-recipe-e2e-runs-"));
    const seeded = yield* seedT3workFixtureProject({
      fixtureRoot: spec.fixtureRoot,
      workspaceRoot,
    });

    const projectId = ProjectId.make(`harness-${recipe.id}`);
    const modelSelection = createModelSelection(
      ProviderInstanceId.make("harness-instance"),
      "harness-model",
    );
    const launchThreadId = `harness-launch-${recipe.id}`;
    const runId = `harness-run-${recipe.id}`;

    // Let the reactor + stub subscribe to the hot domain-event stream before anything dispatches.
    yield* Effect.sleep(Duration.millis(100));
    yield* orchestration.dispatch({
      type: "project.create",
      commandId: CommandId.make(`${runId}-project`),
      projectId,
      title: `Harness ${recipe.id}`,
      workspaceRoot,
      defaultModelSelection: modelSelection,
      createdAt: ISO,
    });
    yield* orchestration.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`${runId}-thread`),
      threadId: ThreadId.make(launchThreadId),
      projectId,
      title: "Harness launch thread",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: ISO,
    });

    const capture: T3workRecipeHarnessCapture = spec.capture ?? {
      commands: [],
      agentPrompts: [],
    };
    const completed: unknown[] = [];
    let seq = 0;
    // runPromiseWith(context), not runPromise: a bare runPromise starts a SEPARATE services
    // invocation, so dispatched commands never reached the engine instance the stub provider
    // subscribed to and the body hung forever on its first agent() ask.
    const context = yield* Effect.context<never>();
    const runDetached = Effect.runPromiseWith(context);
    const dispatch = (command: OrchestrationCommand): Promise<void> => {
      capture.commands.push(command);
      return runDetached(orchestration.dispatch(command)).then(() => undefined);
    };

    // Durable run record + journal, exactly as the server wires them, so the harness can assert
    // a real `workflow_runs` row rather than only in-memory registry state.
    const journalStore = yield* WorkflowJournalStore;
    const runRow = buildRunningWorkflowRunRow({
      runId,
      workflowPath: recipe.workflowPath,
      args: spec.args ?? {},
      launchThreadId,
      projectId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      nowIso: ISO,
    });
    const lifecycle = makeWorkflowRunLifecycle({
      repo: runRepository,
      row: runRow,
      nowIso: () => ISO,
    });

    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId,
        workflowPath: recipe.workflowPath,
        args: spec.args ?? {},
        scripts: recipe.scripts,
        store: journalStore,
        lifecycle,
        runsRoot,
        launchThreadId,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry,
        dispatch,
        newId: () => `harness-id-${(seq += 1)}`,
        nowIso: () => ISO,
        onComplete: async (output) => {
          completed.push(output);
        },
      }),
    );

    // The durable run row exists while the run is live; completion removes it, so read it here.
    const liveRow = yield* runRepository.getById({ runId });

    const answers = spec.answers ?? [];
    let asksAnswered = 0;
    const answeredCorrelations = new Set<string>();
    while (launched.status !== "completed" && completed.length === 0) {
      const nextAsk = (): string | undefined => {
        const pending = registry.peekPending(launchThreadId);
        return pending?.kind === "user.input" && !answeredCorrelations.has(pending.correlationId)
          ? pending.correlationId
          : undefined;
      };
      yield* waitUntil(
        () => completed.length > 0 || nextAsk() !== undefined,
        "the run to complete or suspend on askUser",
        timeoutMs,
      );
      const correlationId = nextAsk();
      if (completed.length > 0 || correlationId === undefined) {
        break;
      }
      answeredCorrelations.add(correlationId);
      yield* answerT3workRecipeHarnessAsk({
        launchThreadId,
        answer: answers[asksAnswered] ?? "{}",
        nonce: `${runId}-${asksAnswered}`,
      });
      asksAnswered += 1;
      if (asksAnswered > answers.length + 2) {
        return yield* Effect.die(new Error("harness answered more asks than the spec provides"));
      }
    }

    const summary = summarizeT3workHarnessCommands(capture.commands);
    const row = Option.isSome(liveRow) ? liveRow : yield* runRepository.getById({ runId });
    NodeFS.rmSync(workspaceRoot, { recursive: true, force: true });
    NodeFS.rmSync(runsRoot, { recursive: true, force: true });
    return {
      recipeId: recipe.id,
      status: completed.length > 0 ? "completed" : launched.status,
      result: completed[0] ?? null,
      phases: summary.phases,
      steps: summary.steps,
      launchStatus: launched.status,
      widgets: summary.widgets,
      notifications: summary.notifications,
      agentPromptCount: capture.commands.filter(
        (command) => (command as { type?: string }).type === "thread.turn.start",
      ).length,
      asksAnswered,
      scriptCalls: recipe.scriptNames,
      workflowRun: Option.isSome(row)
        ? {
            runId: row.value.runId,
            status: row.value.status,
            workflowPath: row.value.workflowPath,
          }
        : null,
      commandTypes: [...new Set(capture.commands.map((command) => command.type))],
      seededWorkItemCount: seeded.workItemCount,
    } satisfies T3workRecipeHarnessReport & {
      readonly seededWorkItemCount: number;
      readonly launchStatus: string;
    };
  });
}

export { makeT3workRecipeHarnessStubProvider };
