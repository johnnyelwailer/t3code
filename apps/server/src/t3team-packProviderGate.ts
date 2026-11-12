import type {
  ProjectId,
  ProviderInstanceConfigMap,
  ProviderInstanceId,
  ServerSettings,
} from "@t3tools/contracts";
import { resolveProjectProviderInstanceEnabled } from "@t3tools/contracts";

import { hostProviderInstances } from "./t3team-hostProviderInstances.ts";

/**
 * The per-project provider gate for an instance the Nexi pack registers at runtime.
 *
 * A pack provider such as `nexplore` is never written to `settings.json`, so the contract's
 * unconfigured-instance rule (only codex and claudeAgent start on) would reject every turn on it.
 * `packInstances` carries its enabled state, and the host's own instances
 * (`hostProviderInstances`) theirs; real settings entries still win over both.
 */
export function resolveProjectProviderInstanceEnabledWithPack(
  settings: Pick<ServerSettings, "providerInstances" | "projectSettingsOverrides">,
  projectId: ProjectId | null,
  instanceId: ProviderInstanceId,
  packInstances: ProviderInstanceConfigMap,
  hostInstances: ProviderInstanceConfigMap = hostProviderInstances(),
): boolean {
  return resolveProjectProviderInstanceEnabled(
    {
      ...settings,
      providerInstances: {
        ...hostInstances,
        ...packInstances,
        ...settings.providerInstances,
      },
    },
    projectId,
    instanceId,
  );
}
