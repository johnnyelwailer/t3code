import * as Schema from "effect/Schema";

import type { ToolRef as GenericToolRef } from "@runbook/tools";
import type { ScriptRef as GenericScriptRef } from "@runbook/scripts";
import type { ModelSelection } from "@runbook/threads/models";

import type { MessageBroker } from "./t3team-sdk.broker.ts";
import type { ToolGroupRef } from "./t3team-sdk.capabilityVocabulary.ts";
import type { AnyRecipeRef } from "./t3team-sdk.recipeTypes.ts";
import type { WorkflowRunIntent } from "./tools/t3team-sdk.workflow.ts";

export type {
  AnyActionRef,
  AnyRecipeRef,
  RecipeContextRequirementSpec,
  AnyWorkflowRef,
  RecipeApplicabilitySpec,
  RecipeBrevity,
  RecipeDerived,
  RecipeDetailDensity,
  RecipeGuidanceStyle,
  RecipeRef,
  RecipeTechnicalDepth,
  RecipeVisiblePredicate,
} from "./t3team-sdk.recipeTypes.ts";
export type { PrimitiveCall, PrimitiveKind, WorkflowRuntime } from "./t3team-sdk.runtimeTypes.ts";
// The capability vocabulary lives in ONE module; re-exported here because this file is the `T.`
// namespace the whole SDK reads types through.
export type {
  EngineCapability,
  ToolGroupId,
  ToolGroupRef,
  WorkflowCapability,
  WorkflowChildCapabilities,
} from "./t3team-sdk.capabilityVocabulary.ts";
export type { ModelRef, ModelSelection } from "@runbook/threads/models";

export type IntegrationMethod = (...args: ReadonlyArray<unknown>) => Promise<unknown>;

export interface IntegrationClient {
  readonly [key: string]: IntegrationClient | IntegrationMethod;
}

export interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface ToolLogger {
  readonly info: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly warn: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly error: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
}

export interface ToolWorkspace {
  readonly readText: (relativePath: string) => Promise<string>;
  readonly writeText: (relativePath: string, content: string) => Promise<void>;
  readonly exists: (relativePath: string) => Promise<boolean>;
}

export interface T3TeamToolHandlerClient {
  readonly renameThread: (input: { readonly title: string }) => Promise<{
    readonly ok: true;
    readonly title: string;
    readonly threadId?: string | undefined;
  }>;
  /** Host-provided project-recipe listing; result is validated against the tool result schema. */
  readonly listRecipes?: () => Promise<unknown>;
  /** Host-provided static workflow validation; result is validated against the tool result schema. */
  readonly validateRecipe?: (input: {
    readonly path?: string;
    readonly source?: string;
  }) => Promise<unknown>;
  /** Host-provided ephemeral workflow launch; result is validated against the tool result schema. */
  readonly runWorkflow?: (input: {
    readonly source?: string;
    readonly workflowPath?: string;
    readonly args?: unknown;
    readonly intent: WorkflowRunIntent;
  }) => Promise<unknown>;
  /** Dispatch a broker-owned host tool by id. Present only on a thread-bound run; the HOST decides
   * which ids it will accept, so this is a transport, not a widening of the tool surface. */
  readonly callHostTool?: (input: {
    readonly tool: string;
    readonly args: unknown;
  }) => Promise<unknown>;
}

export interface WorkflowRef<Inputs = unknown, Outputs = unknown, Path extends string = string> {
  readonly kind: "workflow";
  readonly path: Path;
  readonly absolutePath: string;
  readonly Inputs?: Inputs;
  readonly Outputs?: Outputs;
}

export interface ToolHandlerCtx {
  readonly threadId?: string;
  readonly runId?: string;
  readonly workspaceRoot: string;
  readonly log: ToolLogger;
  readonly fetch: FetchLike;
  readonly workspace: ToolWorkspace;
  /** Call another tool from inside a handler. A **black box**: the nested call is NOT journaled
   * and consumes no `seq` (the enclosing primitive is the journaled checkpoint). */
  readonly callTool: <I, R>(ref: ToolRef<I, R>, args: I) => Promise<R>;
  readonly github?: IntegrationClient;
  readonly jira?: IntegrationClient;
  readonly t3team?: T3TeamToolHandlerClient;
}

export interface ScriptHandlerCtx {
  readonly runId: string;
  readonly workspaceRoot: string;
  readonly log: ToolLogger;
  readonly fetch: FetchLike;
  readonly workspace: ToolWorkspace;
  readonly callTool: <I, R>(ref: ToolRef<I, R>, args: I) => Promise<R>;
}

export type ToolRef<
  I,
  R,
  Id extends string = string,
  Group extends ToolGroupRef = ToolGroupRef,
> = GenericToolRef<I, R, Id, Group, ToolHandlerCtx>;

export type ScriptRef<I, O> = GenericScriptRef<I, O, ScriptHandlerCtx>;

export interface RegisteredWorkflowToolsTree {}
export interface RegisteredWorkflowScriptsTree {}

// The dotted-id → nested-tree derivation lives in its own module; re-exported so importers of this
// file (which is the namespace `T.` everywhere in the SDK) keep seeing both names.
export type { ScriptTreeFromRecord, ToolTreeFromRefs } from "./t3team-sdk.typeTrees.ts";

export type WorkflowInputs<TModule> = TModule extends { Inputs: Schema.Schema<infer V> }
  ? V
  : unknown;
export type WorkflowOutputs<TModule> = TModule extends { Outputs: Schema.Schema<infer V> }
  ? V
  : unknown;

export type AnyToolGroupRef = ToolGroupRef<string>;
export type AnyToolRef = ToolRef<unknown, unknown, string, AnyToolGroupRef>;
export type AnyScriptRef = ScriptRef<unknown, unknown>;

export type WorkflowSdkRegistry = {
  readonly toolGroups: Map<string, AnyToolGroupRef>;
  readonly tools: Map<string, AnyToolRef>;
  readonly recipes: Map<string, AnyRecipeRef>;
};

/** Options shared by `startWorkflow` and `resumeWorkflow`. Re-exported from engine. */
export interface WorkflowRunOptions {
  readonly runsRoot?: string;
  // Durable journal storage (default fs at `runsRoot`); host injects SQLite for restart durability (§OQ2).
  readonly store?: import("./t3team-sdk.journalStore.ts").JournalStore;
  readonly tools?: ReadonlyArray<AnyToolRef>;
  readonly scripts?: Readonly<Record<string, AnyScriptRef>>;
  readonly fetch?: FetchLike;
  readonly workspace?: ToolWorkspace;
  readonly log?: ToolLogger;
  readonly workspaceRoot?: string;
  // `budget` is the body's `budget.total`; `onPhase`/`onLog` are cosmetic progress callbacks.
  readonly budget?: number;
  readonly onPhase?: (title: string) => void;
  readonly onLog?: (message: string) => void;
  // Thread-model wiring: thread verbs fire through `broker` into the host. `launchThreadId` is
  // the chat the user launched from (the `thread` global binds to it; absent → headless).
  // `defaultModel` backs agent/askAgent calls that omit a per-call model.
  readonly broker?: MessageBroker;
  readonly launchThreadId?: string;
  readonly defaultModel?: ModelSelection;
  /** Host client handed to tool handlers as `ToolHandlerCtx.t3team` — the per-run half of a
   * host-tool ref, whose handler is registered globally and so cannot close over the run. */
  readonly t3team?: T3TeamToolHandlerClient;
  /** Host fairness hooks around live tool/script primitives. Replayed entries do not call them. */
  readonly beforePrimitive?: () => Promise<boolean>;
  readonly afterPrimitive?: () => void;
}
