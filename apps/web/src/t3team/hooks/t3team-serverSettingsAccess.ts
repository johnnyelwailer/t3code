/**
 * Module-scope read/write access to server settings, for the fork's persistence helpers.
 *
 * Upstream removed `LocalApi.server` in the 2026-08 sync: server settings no longer hang off the
 * desktop bridge, they are environment-scoped RPC reached through the atom runtime. The fork's
 * sidebar-pin / sidecar-composition helpers run OUTSIDE React (module functions called from
 * effects and fire-and-forget handlers), so they cannot use `usePrimarySettings` /
 * `useUpdatePrimarySettings`.
 *
 * `appAtomRegistry` is upstream's own escape hatch for exactly this (see `previewStateStore.ts`),
 * so this file is the single place that maps "the fork needs server settings without a component"
 * onto it — one adapter instead of one ad-hoc reach per helper.
 */
import type { ServerSettings, ServerSettingsPatch } from "@t3tools/contracts";

import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { primaryServerConfigAtom, serverEnvironment } from "~/state/server";

/**
 * Current primary-environment server settings, or `null` when they have not loaded yet.
 *
 * Reads `primaryServerConfigAtom` rather than `primaryServerSettingsAtom` ON PURPOSE. The latter
 * falls back to `DEFAULT_SERVER_SETTINGS` when the config is absent, which makes "still loading"
 * indistinguishable from "loaded, and the user has nothing stored". Callers here act on that
 * difference destructively: the legacy pin migration treats empty server settings as proof the
 * server has no pins and then overwrites them from local storage — so reading defaults mid-load
 * would delete a user's real pins. `null` means "don't decide yet".
 */
export function readPrimaryServerSettings(): ServerSettings | null {
  if (appAtomRegistry.get(primaryEnvironmentIdAtom) === null) return null;
  return appAtomRegistry.get(primaryServerConfigAtom)?.settings ?? null;
}

/**
 * Persist a server-settings patch on the primary environment. Resolves once the RPC settles;
 * no-ops (resolving) when no environment is connected, which is what every caller here wants —
 * these are best-effort personalization writes, never a reason to fail a user action.
 */
export async function updatePrimaryServerSettings(patch: ServerSettingsPatch): Promise<void> {
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  if (environmentId === null) return;
  await runAtomCommand(
    appAtomRegistry,
    serverEnvironment.updateSettings,
    { environmentId, input: { patch } },
    { label: "t3team server settings update" },
  );
}
