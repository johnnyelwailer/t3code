import "./t3work-sdk.globals.ts";

export { schemaToAffordance } from "./t3work-sdk.affordance.ts";
export { asNamedAttachments, renderAgentAttachments } from "./t3work-sdk.askAttachments.ts";
export { appendResolvedEntry, createHostBroker, createMockBroker } from "./t3work-sdk.broker.ts";
export { builtinTools } from "./t3work-sdk.builtins.ts";
export { hashArgs } from "./t3work-sdk.canonicalJson.ts";
export {
  createDurableWorkflowRuntime,
  resumeWorkflow,
  startWorkflow,
} from "./t3work-sdk.engine.ts";
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
} from "./t3work-sdk.errors.ts";
export {
  githubRead,
  githubWrite,
  jiraRead,
  jiraWrite,
  releaseNotesWrite,
  t3workRecipeRead,
  t3workThreadWrite,
} from "./t3work-sdk.groups.ts";
export { createStoreSink, defaultRunsRoot, FsJournalStore } from "./t3work-sdk.journalStore.ts";
export { buildJournalMaps, insertWireEntry } from "./t3work-sdk.journalReader.ts";
export { toResolvedWire, toWire } from "./t3work-sdk.journalWriter.ts";
export { models } from "./t3work-sdk.models.ts";
export {
  buildScriptTree,
  buildToolTree,
  defineModel,
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
  listRegisteredRecipes,
  listRegisteredToolGroups,
  listRegisteredTools,
  withWorkflowRuntime,
} from "./t3work-sdk.ts";
// Placement `define*` helpers (Epic 19 §Plugin SDK Surface); see ./t3work-sdk.placements.ts.
// The per-section action/defaults schemas stay on the `@t3work/sdk/placements` subpath.
export {
  ActionDefinition,
  defineAction,
  defineSidecarSection,
  RecipeSurface,
  SidecarSectionDefinition,
} from "./t3work-sdk.placements.ts";
export { renameThreadTool } from "./tools/t3work-sdk.t3work.ts";
export { listRecipesTool, validateRecipeTool } from "./tools/t3work-sdk.t3workRecipes.ts";
export type {
  RunWorkflowToolArgs,
  RunWorkflowToolResult,
  WorkflowRunIntent,
} from "./tools/t3work-sdk.workflow.ts";
export { runWorkflowTool } from "./tools/t3work-sdk.workflow.ts";
export { deriveWorkflowShape } from "./t3work-sdk.workflowShape.ts";
export { extractMeta, prepareWorkflow } from "./t3work-sdk.loader.ts";
// Load-time static audits (Epic 25 phase 25.5): determinism + capability, before any run.
export { auditWorkflowSourceStatic, registryToolGroupResolver } from "./t3work-sdk.staticAudit.ts";
export { scanCapabilities } from "./t3work-sdk.capabilityScan.ts";
export { scanDeterminism } from "./t3work-sdk.determinismScan.ts";
export { formatFinding } from "./t3work-sdk.staticAuditTypes.ts";
export { normalizeCapabilities } from "./t3work-sdk.capabilityGating.ts";

export type {
  HandleKind,
  HostBrokerHandlers,
  MessageBroker,
  MessageEnvelope,
  MockBroker,
  MockBrokerOutcome,
} from "./t3work-sdk.broker.ts";
export type { BuiltinToolsTree } from "./t3work-sdk.builtins.ts";
export type {
  DurableWorkflowRuntime,
  StartWorkflowOptions,
  SuspendedResult,
  WorkflowRunOptions,
  WorkflowRunResult,
} from "./t3work-sdk.engine.ts";
export type { AskAffordance, AskFormField } from "./t3work-sdk.affordance.ts";
export type { AgentAttachment, NamedAttachment } from "./t3work-sdk.askAttachments.ts";
export type {
  AgentEffort,
  AskOpts,
  AskUserAttachment,
  AskUserOpts,
  ModelCascade,
  ModelCascadeEntry,
  SpawnThreadOpts,
  Thread,
  ThreadRef,
  WorkflowThreadPrimitives,
} from "./t3work-sdk.threadPrimitives.ts";
export type { ModelCascadeWireEntry } from "./t3work-sdk.modelCascade.ts";
export type { ReplayDriftFacet, ReplayDriftReason } from "./t3work-sdk.errors.ts";
export type { RunMeta } from "./t3work-sdk.journal.ts";
export type { JournalEntry, JournalMaps, ResolvedEntry } from "./t3work-sdk.journalReader.ts";
export type { JournalSink, JournalStore } from "./t3work-sdk.journalStore.ts";
export type { ResolvedWireInput } from "./t3work-sdk.journalWriter.ts";
export type { WorkflowMeta } from "./t3work-sdk.loader.ts";
export type { CapabilityScanOptions } from "./t3work-sdk.capabilityScan.ts";
export type { WorkflowStaticAuditOptions } from "./t3work-sdk.staticAudit.ts";
export type { WorkflowAuditFacet, WorkflowAuditFinding } from "./t3work-sdk.staticAuditTypes.ts";
export type {
  WorkflowShape,
  WorkflowShapeCapability,
  WorkflowShapeStep,
  WorkflowStepKind,
} from "./t3work-sdk.workflowShape.ts";
export type {
  AnyRecipeRef,
  AnyScriptRef,
  EngineCapability,
  FetchLike,
  IntegrationClient,
  IntegrationMethod,
  ModelRef,
  ModelSelection,
  RecipeApplicabilitySpec,
  RecipeBrevity,
  RecipeDetailDensity,
  RecipeGuidanceStyle,
  RecipeRef,
  RecipeTechnicalDepth,
  RegisteredWorkflowScriptsTree,
  RegisteredWorkflowToolsTree,
  ScriptHandlerCtx,
  ScriptRef,
  ScriptTreeFromRecord,
  T3workToolHandlerClient,
  ToolGroupRef,
  ToolHandlerCtx,
  ToolLogger,
  ToolRef,
  ToolTreeFromRefs,
  ToolWorkspace,
  WorkflowCapability,
  WorkflowRef,
} from "./t3work-sdk.ts";
export type { RenameThreadToolArgs, RenameThreadToolResult } from "./tools/t3work-sdk.t3work.ts";
export type {
  ListRecipesToolResult,
  RecipeListEntry,
  RecipeToolIssue,
  RecipeWorkflowMetaSummary,
  RecipeWorkflowShapeSummary,
  ValidateRecipeToolArgs,
  ValidateRecipeToolResult,
} from "./tools/t3work-sdk.t3workRecipes.ts";
