import type { ScopedProjectRef } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import { toastManager } from "~/components/ui/toast";
import { useClientSettings } from "~/hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { useProject } from "~/state/entities";
import { followCloudSessionProject } from "./t3team-cloudSessionProjectFollow";

/**
 * The composer project's logical key, the same one the machine list groups by, so a project
 * on another machine counts as the same project. Null while there is no project.
 */
export function useCloudSessionProjectKey(projectRef: ScopedProjectRef | null): string | null {
  const project = useProject(projectRef);
  const settings = useClientSettings();
  return useMemo(
    () =>
      project === null
        ? null
        : deriveLogicalProjectKeyFromSettings(project, selectProjectGroupingSettings(settings)),
    [project, settings],
  );
}

/**
 * Drops the cloud preference once the composer's project is no longer the one the session was
 * set up for (a queued first message goes back into the composer), and says why.
 */
export function useCloudSessionProjectFollow(input: {
  readonly scopeKey: string | null;
  readonly projectKey: string | null;
}): void {
  const { scopeKey, projectKey } = input;
  useEffect(() => {
    if (scopeKey === null) return;
    const result = followCloudSessionProject(scopeKey, projectKey);
    if (result.kind === "kept") return;
    toastManager.add({
      type: "info",
      title: "Cloud session cleared",
      description:
        result.kind === "cleared"
          ? `${result.label} was set up for another project, so Run on is back to this project's own machines.`
          : "Your message is back in the composer: the project changed after the cloud session was set up for another one.",
    });
  }, [scopeKey, projectKey]);
}
