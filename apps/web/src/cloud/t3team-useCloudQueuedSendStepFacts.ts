/**
 * Live step facts for one draft's queued cloud send: project + provider readiness the flusher
 * and setup card both show.
 */
import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import type { CloudSession } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import type { DraftSessionState } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import { useProjects } from "~/state/entities";
import { useEnvironments } from "~/state/environments";

import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import {
  getCloudQueuedSendProviderReady,
  subscribeCloudQueuedSendProviderReady,
} from "./t3team-cloudQueuedSendProviderReadyStore";
import type { CloudQueuedSendStepFacts } from "./t3team-cloudQueuedSendSteps";
import type { useCloudQueuedSendEnvironmentFacts } from "./t3team-useCloudQueuedSendEnvironmentFacts";

export function useCloudQueuedSendStepFacts(input: {
  readonly queued: CloudQueuedSend | null;
  readonly draft: DraftSessionState | undefined;
  readonly sessions: readonly CloudSession[];
  readonly machineFacts: ReturnType<typeof useCloudQueuedSendEnvironmentFacts>;
  readonly flushing: boolean;
}): CloudQueuedSendStepFacts | null {
  const { queued, draft, sessions, machineFacts, flushing } = input;
  const { environments } = useEnvironments();
  const projects = useProjects();
  const settings = useClientSettings();
  const providerReady = useSyncExternalStore(
    subscribeCloudQueuedSendProviderReady,
    () => (queued === null ? true : getCloudQueuedSendProviderReady(queued.messageId)),
    () => true,
  );
  if (queued === null || draft === undefined) return null;
  const facts = resolveCloudQueuedSendFacts({
    queued,
    draft,
    sessions,
    environments,
    projects,
    threadShells: [],
    groupingSettings: selectProjectGroupingSettings(settings),
    bootstrapProjectIdOf: machineFacts.bootstrapProjectIdOf,
  });
  const projectReady = facts.project !== null;
  return {
    ...facts,
    queued,
    projectReady,
    // Match the flusher: skip the provider gate until project checkout finishes.
    providerReady: projectReady ? providerReady : true,
    flushing,
  };
}
