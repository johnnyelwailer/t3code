/** T3Team's authoring aliases over the host-neutral @runbook/threads contracts. */

import type {
  AgentEffort as GenericAgentEffort,
  AgentOpts as GenericAgentOpts,
  AnyAskOpts as GenericAnyAskOpts,
  AskOpts as GenericAskOpts,
  AskUserAttachment as GenericAskUserAttachment,
  AskUserOpts as GenericAskUserOpts,
  ModelCascade as GenericModelCascade,
  ModelCascadeEntry as GenericModelCascadeEntry,
  ShowWidgetInput as GenericShowWidgetInput,
  SpawnThreadOpts as GenericSpawnThreadOpts,
  Thread as GenericThread,
  ThreadRef as GenericThreadRef,
  WorkflowThreadPrimitives as GenericWorkflowThreadPrimitives,
} from "@runbook/threads";

import type { WorkflowChildCapabilities } from "./t3team-sdk.capabilityVocabulary.ts";

export type AgentEffort = GenericAgentEffort;
export type ModelCascadeEntry = GenericModelCascadeEntry;
export type ModelCascade = GenericModelCascade;
export type ThreadRef = GenericThreadRef;
export type AskOpts<R = string> = GenericAskOpts<R>;
export type AskUserAttachment = GenericAskUserAttachment;
export type AskUserOpts<R = string> = GenericAskUserOpts<R>;
export type AnyAskOpts<R = string> = GenericAnyAskOpts<R>;
export type SpawnThreadOpts = GenericSpawnThreadOpts<WorkflowChildCapabilities>;
export type AgentOpts<R = string> = GenericAgentOpts<R, WorkflowChildCapabilities>;
export type ShowWidgetInput = GenericShowWidgetInput;
export type Thread = GenericThread;
export type WorkflowThreadPrimitives = GenericWorkflowThreadPrimitives<WorkflowChildCapabilities>;

export type { WorkflowChildCapabilities } from "./t3team-sdk.capabilityVocabulary.ts";
