/**
 * Readiness classification for a configured provider instance — the connect
 * flow's view over `ProviderInstanceEntry`, split out of `providerInstances`
 * because it is a distinct concept (why an instance isn't ready) layered on
 * top of that module's core projection (what an instance is).
 *
 * @module t3team-providerInstanceReadiness
 */
import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "./providerInstances";

/**
 * Why an instance isn't ready, when it isn't. `isProviderInstancePickerReady`
 * collapses all of these into one boolean, which is right for deciding
 * *whether* to show a model list, but wrong for deciding *what else* to show
 * instead — an instance that just needs a sign-in is a very different UI
 * moment than one whose driver isn't shipped in this build.
 *
 * `otherError` also covers the "genuinely disabled" cases (disabled in
 * settings, driver unavailable) — callers that want to distinguish those
 * from a real probe error should check `entry.enabled`/`entry.isAvailable`
 * themselves first; this helper only tells the caller whether *connecting*
 * (install or auth) is the right next action.
 */
export type ProviderInstanceReadiness = "ready" | "needsInstall" | "needsAuth" | "otherError";

/**
 * Classifies why a configured, enabled, available instance isn't ready yet.
 *
 * Order matters: `installed` is checked before `auth` — an uninstalled CLI's
 * health probe often can't determine auth state at all, so `needsInstall`
 * must win over `needsAuth` rather than the reverse.
 *
 * Critical subtlety: do NOT match only `"unauthenticated"`. Codex's health
 * probe reports `auth.status: "unauthenticated"` when it needs a login
 * (`apps/server/src/provider/Layers/CodexProvider.ts`), but Claude's probe
 * defaults `auth.status` to `"unknown"` in every path that isn't a confirmed
 * authenticated session — disabled-in-settings, CLI missing, a failed health
 * check (`apps/server/src/provider/Layers/ClaudeProvider.ts`) — and never
 * emits `"unauthenticated"` at all in those paths. Treating only
 * `"unauthenticated"` as `needsAuth` would mean Claude, the tool with the
 * worse auth UX, never shows a connect prompt. Both values are `needsAuth`.
 */
export function resolveProviderInstanceReadiness(
  entry: ProviderInstanceEntry,
): ProviderInstanceReadiness {
  if (isProviderInstancePickerReady(entry)) return "ready";
  if (!entry.enabled || !entry.isAvailable) return "otherError";
  if (!entry.installed) return "needsInstall";
  const authStatus = entry.snapshot.auth.status;
  if (authStatus === "unauthenticated" || authStatus === "unknown") return "needsAuth";
  return "otherError";
}

/**
 * Whether an otherwise-selectable instance should be clickable specifically
 * to show a connect/install prompt (as opposed to staying disabled). Used by
 * `ModelPickerSidebar` to let the user click through to `needsInstall`/
 * `needsAuth` tabs that were previously indistinguishable from — and
 * disabled the same as — a genuine probe error.
 */
export function isProviderInstanceConnectable(entry: ProviderInstanceEntry): boolean {
  const readiness = resolveProviderInstanceReadiness(entry);
  return readiness === "needsInstall" || readiness === "needsAuth";
}
