/**
 * Queued sends that have reached project checkout and need a CloudQueuedSendProviderEnsure.
 */
import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import type { DraftSessionState } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironments } from "~/state/environments";

import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import type { useCloudQueuedSendEnvironmentFacts } from "./t3team-useCloudQueuedSendEnvironmentFacts";

export function useCloudQueuedSendProviderEnsureTargets(input: {
  readonly queuedByDraft: Readonly<Record<string, CloudQueuedSend>>;
  readonly draftThreadsByKey: Readonly<Record<string, DraftSessionState>>;
  readonly sessions: readonly CloudSession[];
  readonly machineFacts: ReturnType<typeof useCloudQueuedSendEnvironmentFacts>;
}): ReadonlyArray<{
  readonly messageId: string;
  readonly queued: CloudQueuedSend;
  readonly environmentId: EnvironmentId | null;
  readonly projectReady: boolean;
}> {
  const { environments } = useEnvironments();
  const projects = useProjects();
  const threadShells = useThreadShells();
  const settings = useClientSettings();
  const { queuedByDraft, draftThreadsByKey, sessions, machineFacts } = input;
  const groupingSettings = selectProjectGroupingSettings(settings);
  return Object.entries(queuedByDraft).flatMap(([draftId, queued]) => {
    const draft = draftThreadsByKey[draftId];
    if (draft === undefined || draft.promotedTo) return [];
    const facts = resolveCloudQueuedSendFacts({
      queued,
      draft,
      sessions,
      environments,
      projects,
      threadShells,
      groupingSettings,
      bootstrapProjectIdOf: machineFacts.bootstrapProjectIdOf,
    });
    return [
      {
        messageId: queued.messageId,
        queued,
        environmentId: facts.environmentId,
        projectReady: facts.project !== null,
      },
    ];
  });
}
