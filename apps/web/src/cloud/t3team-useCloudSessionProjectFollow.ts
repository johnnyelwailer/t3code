import type { ScopedProjectRef } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

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
 * Keeps this composer's cloud Run-on stamp on the current project. A switch rebinds the same
 * session (and any queued first message) instead of clearing them.
 */
export function useCloudSessionProjectFollow(input: {
  readonly scopeKey: string | null;
  readonly projectKey: string | null;
}): void {
  const { scopeKey, projectKey } = input;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- rebinds the module-level Run-on stamp when the composer project changes
  useEffect(() => {
    if (scopeKey === null) return;
    followCloudSessionProject(scopeKey, projectKey);
  }, [scopeKey, projectKey]);
}
