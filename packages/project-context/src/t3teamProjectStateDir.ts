/**
 * The ONE owner of the project state dir name — the hidden directory in a project workspace
 * that holds context, setup, recipes, skills, the reference manifest and child worktrees.
 *
 * Vanilla T3 Code keeps `.t3team`; pack builds (the Nexi distribution) name it `.nexi`, behind
 * the runtime feature flag `NEXI_FF_NEXI_STATE_DIR` (`1`/`true`/`on`; default off). Every
 * state-path constant (server, web, shared packages) derives from `PROJECT_STATE_DIR`, and all
 * detection reads it.
 *
 * The env is read through `globalThis.process` so the module stays browser-safe: a browser has
 * no env and resolves the canonical `.t3team`. Paths a client addresses with the canonical name
 * are mapped onto the physical one by the server with `toPhysicalProjectStatePath` (idempotent),
 * so the wire vocabulary stays stable across hosts. The workflow journal (`.t3team-runs/`) is a
 * separate directory and is not affected.
 */

import { readFeatureFlag } from "./t3teamFeatureFlags.ts";

/** Canonical state dir name: vanilla builds, and the wire vocabulary clients address paths with. */
export const T3TEAM_PROJECT_STATE_DIR = ".t3team";
/** Pack-build state dir name. */
export const NEXI_PROJECT_STATE_DIR = ".nexi";
/** Environment override selecting `.nexi`. `1`/`true`/`on` on, anything else off. */
export const NEXI_STATE_DIR_FLAG_ENV = "NEXI_FF_NEXI_STATE_DIR";

type ReadEnv = (key: string) => string | undefined;
const readProcessEnv: ReadEnv = (key) =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];

export function isNexiStateDirEnabled(readEnv: ReadEnv = readProcessEnv): boolean {
  return readFeatureFlag("NEXI_STATE_DIR", readEnv);
}

export function resolveProjectStateDirName(readEnv: ReadEnv = readProcessEnv): string {
  return isNexiStateDirEnabled(readEnv) ? NEXI_PROJECT_STATE_DIR : T3TEAM_PROJECT_STATE_DIR;
}

/** The state dir name for this process. Fixed at load: a process never splits its state across
 * two directories. */
export const PROJECT_STATE_DIR = resolveProjectStateDirName();

/** Advertise the effective selection, even after an env or DB flag update. */
export function isNexiStateDirSelectedAtStartup(): boolean {
  return PROJECT_STATE_DIR === NEXI_PROJECT_STATE_DIR;
}

const CANONICAL_STATE_DIR_SEGMENT = /(^|[\\/])\.t3team(?=[\\/]|$)/;

/** Maps a path addressed with the canonical state dir name onto the physical one: a
 * workspace-relative path (`.t3team/recipes/x`) or an absolute one (`/ws/.t3team/recipes/x`).
 * Only the first whole `.t3team` segment is mapped, so `.t3team-runs/` and paths outside the
 * state dir (and already-physical paths) pass through unchanged. */
export function toPhysicalProjectStatePath(
  statePath: string,
  stateDirName: string = PROJECT_STATE_DIR,
): string {
  if (stateDirName === T3TEAM_PROJECT_STATE_DIR) return statePath;
  const normalized = statePath.replace(/^\.\/+/, "");
  if (!CANONICAL_STATE_DIR_SEGMENT.test(normalized)) return statePath;
  return normalized.replace(
    CANONICAL_STATE_DIR_SEGMENT,
    (_match, separator: string) => `${separator}${stateDirName}`,
  );
}
