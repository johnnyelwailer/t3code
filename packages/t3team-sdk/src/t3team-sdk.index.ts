import "./t3team-sdk.globals.ts";

export { schemaToAffordance } from "./t3team-sdk.affordance.ts";
export { asNamedAttachments, renderAgentAttachments } from "./t3team-sdk.askAttachments.ts";
export { appendResolvedEntry, createHostBroker, createMockBroker } from "./t3team-sdk.broker.ts";
export { builtinTools } from "./t3team-sdk.builtins.ts";
export { hashArgs } from "./t3team-sdk.canonicalJson.ts";
export {
  createDurableWorkflowRuntime,
  resumeWorkflow,
  startWorkflow,
} from "./t3team-sdk.engine.ts";
export {
  CancelledError,
  JournalSchemaError,
  JournalSerializeError,
  PermissionDeniedError,
  ProviderUnavailableError,
  ReplayDriftError,
  SchemaExhaustedError,
  TargetMissingError,
  TimeoutError,
  WorkflowError,
  WorkflowLoadError,
  WorkflowRunNotFoundError,
} from "./t3team-sdk.errors.ts";
export {
  githubRead,
  githubWrite,
  jiraRead,
  jiraWrite,
  releaseNotesWrite,
  t3teamRecipeRead,
  t3teamThreadWrite,
} from "./t3team-sdk.groups.ts";
export { createStoreSink, defaultRunsRoot, FsJournalStore } from "./t3team-sdk.journalStore.ts";
export { buildJournalMaps, insertWireEntry } from "./t3team-sdk.journalReader.ts";
export { toResolvedWire, toWire } from "./t3team-sdk.journalWriter.ts";
export { models } from "./t3team-sdk.models.ts";
export {
  buildScriptTree,
  buildToolTree,
  DEFAULT_RECIPE_ACTION_NAME,
  defineModel,
  definePrompt,
  defineRecipe,
  defineScript,
  defineTool,
  defineToolGroup,
  defineWorkflow,
  executeRegisteredTool,
  executeScriptHandler,
  executeToolHandler,
  getRegisteredRecipe,
  getRegisteredTool,
  getRegisteredToolGroup,
  isPromptRef,
  listRegisteredRecipes,
  listRegisteredToolGroups,
  listRegisteredTools,
  withWorkflowRuntime,
} from "./t3team-sdk.ts";
// Placement `define*` helpers (Epic 19 §Plugin SDK Surface); see ./t3team-sdk.placements.ts.
// The per-section action/defaults schemas stay on the `@t3team/sdk/placements` subpath.
export {
  ActionDefinition,
  defineAction,
  defineSidecarSection,
  RecipeSurface,
  SidecarSectionDefinition,
} from "./t3team-sdk.placements.ts";
// The engine API as ordinary imports for orchestration bodies (Epic 25).
export {
  agent,
  getArgs,
  getBudget,
  getScripts,
  getThread,
  getTools,
  log,
  now,
  parallel,
  phase,
  pipeline,
  spawnThread,
  wait,
  waitUntil,
  withBodyApi,
  workflow,
} from "./t3team-sdk.engineApi.ts";
export { renameThreadTool } from "./tools/t3team-sdk.t3team.ts";
export { listRecipesTool, validateRecipeTool } from "./tools/t3team-sdk.t3teamRecipes.ts";
export type {
  RunWorkflowToolArgs,
  RunWorkflowToolResult,
  WorkflowRunIntent,
} from "./tools/t3team-sdk.workflow.ts";
export { runWorkflowTool } from "./tools/t3team-sdk.workflow.ts";
export { deriveWorkflowShape } from "./t3team-sdk.workflowShape.ts";
export { extractMeta, prepareWorkflow } from "./t3team-sdk.loader.ts";
// Load-time static audits (Epic 25 phase 25.5): determinism + capability, before any run.
export { auditWorkflowSourceStatic, registryToolGroupResolver } from "./t3team-sdk.staticAudit.ts";
export { scanCapabilities } from "./t3team-sdk.capabilityScan.ts";
export { scanDeterminism } from "./t3team-sdk.determinismScan.ts";
export { formatFinding } from "./t3team-sdk.staticAuditTypes.ts";
export { normalizeCapabilities } from "./t3team-sdk.capabilityGating.ts";

export type {
  HandleKind,
  HostBrokerHandlers,
  MessageBroker,
  MessageEnvelope,
  MockBroker,
  MockBrokerOutcome,
} from "./t3team-sdk.broker.ts";
export type { BuiltinToolsTree } from "./t3team-sdk.builtins.ts";
export type {
  DurableWorkflowRuntime,
  StartWorkflowOptions,
  SuspendedResult,
  WorkflowRunOptions,
  WorkflowRunResult,
} from "./t3team-sdk.engine.ts";
export type { AskAffordance, AskFormField } from "./t3team-sdk.affordance.ts";
export type { AgentAttachment, NamedAttachment } from "./t3team-sdk.askAttachments.ts";
export type {
  AgentEffort,
  AgentOpts,
  AskOpts,
  AskUserAttachment,
  AskUserOpts,
  ModelCascade,
  ModelCascadeEntry,
  SpawnThreadOpts,
  Thread,
  ThreadRef,
  WorkflowChildCapabilities,
  WorkflowThreadPrimitives,
} from "./t3team-sdk.threadPrimitives.ts";
export type { ModelCascadeWireEntry } from "./t3team-sdk.modelCascade.ts";
export type { ReplayDriftFacet, ReplayDriftReason } from "./t3team-sdk.errors.ts";
export type { RunMeta } from "./t3team-sdk.journal.ts";
export type { JournalEntry, JournalMaps, ResolvedEntry } from "./t3team-sdk.journalReader.ts";
export type { JournalSink, JournalStore } from "./t3team-sdk.journalStore.ts";
export type { ResolvedWireInput } from "./t3team-sdk.journalWriter.ts";
export type { WorkflowMeta } from "./t3team-sdk.loader.ts";
export type { CapabilityScanOptions } from "./t3team-sdk.capabilityScan.ts";
export type { WorkflowStaticAuditOptions } from "./t3team-sdk.staticAudit.ts";
export type { WorkflowAuditFacet, WorkflowAuditFinding } from "./t3team-sdk.staticAuditTypes.ts";
export type {
  WorkflowShape,
  WorkflowShapeCapability,
  WorkflowShapeStep,
  WorkflowStepKind,
} from "./t3team-sdk.workflowShape.ts";
export type { PromptRef } from "./t3team-sdk.prompt.ts";
export type {
  AnyActionRef,
  AnyRecipeRef,
  AnyScriptRef,
  AnyWorkflowRef,
  EngineCapability,
  FetchLike,
  IntegrationClient,
  IntegrationMethod,
  ModelRef,
  ModelSelection,
  RecipeApplicabilitySpec,
  RecipeBrevity,
  RecipeDerived,
  RecipeDetailDensity,
  RecipeGuidanceStyle,
  RecipeRef,
  RecipeTechnicalDepth,
  RecipeVisiblePredicate,
  RegisteredWorkflowScriptsTree,
  RegisteredWorkflowToolsTree,
  ScriptHandlerCtx,
  ScriptRef,
  ScriptTreeFromRecord,
  T3TeamToolHandlerClient,
  ToolGroupId,
  ToolGroupRef,
  ToolHandlerCtx,
  ToolLogger,
  ToolRef,
  ToolTreeFromRefs,
  ToolWorkspace,
  WorkflowCapability,
  WorkflowRef,
} from "./t3team-sdk.ts";
export type { RenameThreadToolArgs, RenameThreadToolResult } from "./tools/t3team-sdk.t3team.ts";
export type {
  ListRecipesToolResult,
  RecipeListEntry,
  RecipeToolIssue,
  RecipeWorkflowMetaSummary,
  RecipeWorkflowShapeSummary,
  ValidateRecipeToolArgs,
  ValidateRecipeToolResult,
} from "./tools/t3team-sdk.t3teamRecipes.ts";
