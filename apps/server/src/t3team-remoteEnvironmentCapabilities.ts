/**
 * What a `remoteEnvironment` provider session declares: the capabilities of an ACP adapter minus
 * everything that happens on the cloud session instead, and the provider session record built
 * from them (`t3team-remoteEnvironmentDriver.ts`).
 */
import { AcpProviderCapabilitiesV2 } from "@t3tools/provider-acp/server/adapter";
import type {
  OrchestrationV2ProviderCapabilities,
  OrchestrationV2ProviderSession,
  ProviderInstanceId,
  ProviderSessionId,
} from "@t3tools/contracts";
import type * as DateTime from "effect/DateTime";

import { REMOTE_ENVIRONMENT_DRIVER } from "./t3team-remoteEnvironmentTurn.ts";

/**
 * The turns run elsewhere: no approvals, steering, rollback, fork or local checkpoints here; the
 * remote run's own provider does all of that on the session.
 */
export const REMOTE_ENVIRONMENT_CAPABILITIES = {
  ...AcpProviderCapabilitiesV2,
  threads: { ...AcpProviderCapabilitiesV2.threads, canRollbackThread: false },
  turns: {
    ...AcpProviderCapabilitiesV2.turns,
    supportsSteeringByInterruptRestart: false,
  },
  streaming: {
    ...AcpProviderCapabilitiesV2.streaming,
    streamsReasoning: false,
    streamsToolOutput: false,
  },
  approvals: {
    ...AcpProviderCapabilitiesV2.approvals,
    supportsCommandApproval: false,
    supportsFileReadApproval: false,
    supportsFileChangeApproval: false,
  },
  context: {
    ...AcpProviderCapabilitiesV2.context,
    canGenerateSummaries: false,
    canConsumeHandoffSummaries: false,
    supportsDeltaHandoff: false,
    supportsFullThreadHandoff: false,
  },
  checkpointing: {
    ...AcpProviderCapabilitiesV2.checkpointing,
    appCanCheckpointFilesystem: false,
    supportsNestedCheckpointScopes: false,
    providerCanRollbackConversation: false,
    providerRollbackReturnsSnapshot: false,
  },
} satisfies OrchestrationV2ProviderCapabilities;

export const remoteEnvironmentProviderSession = (input: {
  readonly providerSessionId: ProviderSessionId;
  readonly instanceId: ProviderInstanceId;
  readonly cwd: string;
  readonly now: DateTime.Utc;
}): OrchestrationV2ProviderSession => ({
  id: input.providerSessionId,
  driver: REMOTE_ENVIRONMENT_DRIVER,
  providerInstanceId: input.instanceId,
  status: "ready",
  cwd: input.cwd,
  model: null,
  capabilities: REMOTE_ENVIRONMENT_CAPABILITIES,
  createdAt: input.now,
  updatedAt: input.now,
  lastError: null,
});
