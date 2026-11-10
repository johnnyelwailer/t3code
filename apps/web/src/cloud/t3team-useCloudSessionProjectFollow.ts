import type { ScopedProjectRef } from "@t3tools/contracts";
import { useMemo } from "react";

import { useClientSettings } from "~/hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { useProject } from "~/state/entities";

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
 * Retain point for a pending cloud session when the composer project changes. Clearing with a
 * toast was wrong (hive#1215): the VM stays; checkout binds at queue time from the confirmed project.
 */
export function useCloudSessionProjectFollow(_input: {
  readonly scopeKey: string | null;
  readonly projectKey: string | null;
}): void {}
