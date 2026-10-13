/**
 * Effective provider-instance enablement for a project, aware of pack providers.
 *
 * Upstream's `resolveProjectProviderInstanceEnabled` only knows instances persisted in user
 * settings. Distribution / pack providers are registered at boot through the pack overlay and never
 * land in user settings, so the settings-only answer would treat every pack instance (for
 * example the distribution's own agent) as disabled and refuse to start its threads. A project's
 * explicit override still wins, so a project can turn a pack provider off.
 */
import type { ProjectId, ProviderInstanceId, ServerSettings } from "@t3tools/contracts";
import { resolveProjectProviderInstanceEnabled } from "@t3tools/contracts";

import { getPackProviderOverlay } from "../t3team-pack-providerOverlay.ts";

export const resolveProjectProviderInstanceEnabledPackAware = (
  settings: Pick<ServerSettings, "providerInstances" | "projectSettingsOverrides">,
  projectId: ProjectId | null,
  instanceId: ProviderInstanceId,
): boolean => {
  const override =
    projectId === null
      ? undefined
      : settings.projectSettingsOverrides[projectId]?.providerInstances?.[instanceId]?.enabled;
  if (override === undefined && Object.hasOwn(getPackProviderOverlay(), instanceId)) {
    return !Object.hasOwn(settings.providerInstances, instanceId)
      ? true
      : resolveProjectProviderInstanceEnabled(settings, projectId, instanceId);
  }
  return resolveProjectProviderInstanceEnabled(settings, projectId, instanceId);
};
