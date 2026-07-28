/**
 * Client-side helpers for a project's work-source binding (Jira/Linear/GitHub/managed, or plain
 * `local`). This module is the single place that translates between:
 *
 *  - `ProjectSourceBinding` (`@t3tools/contracts`) — the server-persisted, all-or-nothing union
 *    carried on `project.create`/`project.meta.update` commands and on the live project shell.
 *  - `ProjectSource` (`@t3tools/project-context`) — the client-shape source used throughout the
 *    wizard/store/UI, with optional fields and a client-only `raw` bag.
 *
 * See Defect 1 in the wizard-binding-fix task: a binding that only ever lived in this client shape
 * (localStorage) never reached the server, so a fresh state dir lost it and the loose-workspace
 * synthesis path then fabricated a fake one. `toProjectSource`/`toSourceBindingCommand` are the only
 * conversions between the two shapes; `reconcileStoredProjectSource` is the only place a stored
 * binding is merged against the live server truth.
 */
import type { ProjectShellProject, ProjectSource } from "@t3tools/project-context";
import type { ProjectSourceBinding } from "@t3tools/contracts";
import type { Project } from "~/types";

export type ProjectBindingState = "local" | "bound" | "needs-repair";

/**
 * Classifies a client-shape source: `"local"` (no work-source binding), `"bound"` (a non-local
 * provider with both ids needed to read it), or `"needs-repair"` (a non-local provider missing
 * `accountId`/`externalProjectId` — a drifted or legacy binding the repair UI must fix).
 */
export function projectBindingState(source: ProjectSource): ProjectBindingState {
  if (source.provider === "local") {
    return "local";
  }
  return source.accountId && source.externalProjectId ? "bound" : "needs-repair";
}

/**
 * Decodes a server-persisted binding into the client shape. Returns `null` when the server sent no
 * binding at all (historical projects, or a snapshot predating this field) — callers decide the
 * fallback; this never fabricates ids.
 */
export function toProjectSource(binding: ProjectSourceBinding | undefined): ProjectSource | null {
  if (!binding) {
    return null;
  }
  if (binding.provider === "local") {
    return { provider: "local" };
  }
  return {
    provider: binding.provider,
    accountId: binding.accountId,
    externalProjectId: binding.externalProjectId,
    ...(binding.externalProjectKey ? { externalProjectKey: binding.externalProjectKey } : {}),
    ...(binding.externalProjectUrl ? { externalProjectUrl: binding.externalProjectUrl } : {}),
  };
}

/**
 * Encodes a client-shape source into the server command union for `project.create` /
 * `project.meta.update`. A non-local source missing the ids the union requires (a broken /
 * needs-repair binding) degrades to `{ provider: "local" }` rather than sending an invalid partial
 * member.
 */
export function toSourceBindingCommand(source: ProjectSource): ProjectSourceBinding {
  if (source.provider === "local" || !source.accountId || !source.externalProjectId) {
    return { provider: "local" };
  }
  return {
    provider: source.provider,
    accountId: source.accountId,
    externalProjectId: source.externalProjectId,
    ...(source.externalProjectKey ? { externalProjectKey: source.externalProjectKey } : {}),
    ...(source.externalProjectUrl ? { externalProjectUrl: source.externalProjectUrl } : {}),
  };
}

function sourcesEqual(a: ProjectSource, b: ProjectSource): boolean {
  return (
    a.provider === b.provider &&
    a.accountId === b.accountId &&
    a.externalProjectId === b.externalProjectId &&
    a.externalProjectKey === b.externalProjectKey &&
    a.externalProjectUrl === b.externalProjectUrl &&
    JSON.stringify(a.raw) === JSON.stringify(b.raw)
  );
}

/**
 * Reconciles a stored (localStorage) project's source against the live server project. Monotone —
 * never downgrades a project that already has a working binding:
 *  - server binding present -> server wins (it is the source of truth once it exists).
 *  - server binding absent but the stored copy already has a non-local one -> keep the stored
 *    binding (drift: the server hasn't caught up, or the snapshot predates this field); the repair
 *    UI promotes it later — never silently drop a working binding back to local.
 *  - neither -> an honest `{ provider: "local" }`, never a fabricated external id.
 *
 * `raw` (client-only, e.g. the owning environmentId) is never part of the server binding and is
 * always carried forward from the stored copy.
 */
export function reconcileStoredProjectSource(
  stored: ProjectShellProject,
  live: Project,
): ProjectShellProject {
  const raw = stored.source.raw;
  const liveSource = toProjectSource(live.source);
  const nextSource: ProjectSource =
    liveSource ?? (stored.source.provider === "local" ? { provider: "local" } : stored.source);
  const withRaw = raw !== undefined ? { ...nextSource, raw } : nextSource;
  return sourcesEqual(stored.source, withRaw) ? stored : { ...stored, source: withRaw };
}
