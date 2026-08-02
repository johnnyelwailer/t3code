/** T3Team's typed adapter binding for the reusable thread/agent primitives. */

import {
  createThreadPrimitives as createGenericThreadPrimitives,
  workflowChildTitleFromPrompt,
} from "@runbook/threads/primitives";
import type { MessageBroker } from "@runbook/threads/broker";
import type { HandleDispatch } from "@runbook/core/handles";
import type { ModelSelection } from "./t3team-sdk.types.ts";
import type { Thread, WorkflowThreadPrimitives } from "./t3team-sdk.threadTypes.ts";
import type { WorkflowChildCapabilities } from "./t3team-sdk.capabilityVocabulary.ts";

export { workflowChildTitleFromPrompt };

export type {
  AgentEffort,
  AgentOpts,
  AskOpts,
  AskUserAttachment,
  AskUserOpts,
  ModelCascade,
  ModelCascadeEntry,
  ShowWidgetInput,
  SpawnThreadOpts,
  Thread,
  ThreadRef,
  WorkflowChildCapabilities,
  WorkflowThreadPrimitives,
} from "./t3team-sdk.threadTypes.ts";

export function createThreadPrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
  readonly launchThreadId: string | undefined;
  readonly defaultModel: ModelSelection | undefined;
  readonly log?: (message: string) => void;
}): WorkflowThreadPrimitives {
  return createGenericThreadPrimitives<WorkflowChildCapabilities>(deps);
}
