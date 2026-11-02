/**
 * The ONE owner of the project state dir name — the hidden directory in a project workspace
 * that holds context, setup, recipes, skills, the reference manifest and child worktrees.
 *
 * `.agents/nexi` is the default and the only place new state is written. The legacy `.nexi` is
 * still READ (`projectStateReadDirNames`; the new location wins on conflict) and a one-time
 * migration moves it. The physical dir is `.t3team` only when `NEXI_FF_NEXI_STATE_DIR` is
 * explicitly off. The boolean comes from `readFeatureFlag` (env > feature_flags snapshot > code
 * default on): explicit `0`/`false`/`off` or a snapshot value of false selects `.t3team`;
 * otherwise the name is `.agents/nexi`. Unset and blank env are not an override. Every
 * state-path constant (server, web, shared packages) derives from `PROJECT_STATE_DIR`, and all
 * detection reads it. The name has TWO segments: join it, never compare it to one segment.
 *
 * The env is read through `globalThis.process` so the module stays browser-safe: a browser has
 * no env and therefore resolves the default `.agents/nexi`. Paths a client addresses with the canonical
 * name are mapped onto the physical one by the server with `toPhysicalProjectStatePath`
 * (idempotent), so the wire vocabulary stays stable across hosts. The workflow journal
 * (`.t3team-runs/`) is a separate directory and is not affected.
 */

import { readFeatureFlag } from "./t3teamFeatureFlags.ts";

/** Canonical state dir name: the wire vocabulary, and the physical dir when the flag is explicitly off. */
export const T3TEAM_PROJECT_STATE_DIR = ".t3team";
/** Pack-build state dir name, relative to the project root (two segments, `/` on every OS). */
export const NEXI_PROJECT_STATE_DIR = ".agents/nexi";
/** The state dir name before `.agents/nexi`. Still read, never written; a migration moves it. */
export const LEGACY_NEXI_PROJECT_STATE_DIR = ".nexi";
/** Environment override. Explicit `0`/`false`/`off` selects `.t3team`; `1`/`true`/`on` selects `.agents/nexi`. */
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

/** Every state dir name a project may carry on disk, newest first: where to look, in order. The
 * first entry is where new state is written and wins on conflict. `.t3team` is not read here: it
 * is the wire vocabulary and the flag-off dir, and moves forward through the migration. */
export function projectStateReadDirNames(stateDirName: string = PROJECT_STATE_DIR): string[] {
  return stateDirName === NEXI_PROJECT_STATE_DIR
    ? [NEXI_PROJECT_STATE_DIR, LEGACY_NEXI_PROJECT_STATE_DIR]
    : [stateDirName];
}

const STATE_DIR_PREFIXES: ReadonlyArray<string> = [
  NEXI_PROJECT_STATE_DIR,
  LEGACY_NEXI_PROJECT_STATE_DIR,
  T3TEAM_PROJECT_STATE_DIR,
].map((name) => `${name}/`);

/** Whether a project-relative path (either separator) is inside any state dir this product has
 * ever used: `.agents/nexi/`, `.nexi/` or `.t3team/`. Not a security check. */
export function isProjectStatePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
  return STATE_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const CANONICAL_STATE_DIR_SEGMENT = /(^|[\\/])\.t3team(?=[\\/]|$)/g;
const PHYSICAL_STATE_DIR_SEGMENT = /(^|[\\/])(?:\.agents[\\/]nexi|\.nexi)(?=[\\/]|$)/;

/** Maps a path addressed with the canonical state dir name onto the physical one: a
 * workspace-relative path (`.t3team/recipes/x`) or an absolute one (`/ws/.t3team/recipes/x`).
 * The LAST whole `.t3team` segment is the state dir being addressed, so unrelated ancestor
 * directories that happen to be named `.t3team` (for example this app's own child-worktree
 * roots) are left alone when the path already contains a whole `.nexi` segment after them.
 * `.t3team-runs/` and paths without a state dir (and already-physical paths) pass through
 * unchanged. */
export function toPhysicalProjectStatePath(
  statePath: string,
  stateDirName: string = PROJECT_STATE_DIR,
): string {
  if (stateDirName === T3TEAM_PROJECT_STATE_DIR) return statePath;
  const normalized = statePath.replace(/^\.\/+/, "");
  const matches = [...normalized.matchAll(CANONICAL_STATE_DIR_SEGMENT)];
  if (matches.length === 0) return statePath;
  const last = matches[matches.length - 1]!;
  const tail = normalized.slice(last.index! + last[0].length);
  if (PHYSICAL_STATE_DIR_SEGMENT.test(tail)) return statePath;
  const separator = last[1] === "\\" ? "\\" : "/";
  const physicalName = separator === "/" ? stateDirName : stateDirName.replaceAll("/", separator);
  return normalized.slice(0, last.index! + (last[1]?.length ?? 0)) + physicalName + tail;
}
