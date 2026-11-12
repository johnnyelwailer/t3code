/**
 * The ONE owner of the project state dir name — the hidden directory in a project workspace
 * that holds context, setup, recipes, skills, the reference manifest and child worktrees.
 *
 * `.agents/nexi` is the default. The physical dir is `.t3team` only when `NEXI_FF_NEXI_STATE_DIR`
 * is explicitly off. The boolean comes from `readFeatureFlag` (env > feature_flags snapshot >
 * code default on): explicit `0`/`false`/`off` or a snapshot value of false selects `.t3team`;
 * otherwise the name is `.agents/nexi`. Unset and blank env are not an override. Every state-path
 * constant (server, web, shared packages) derives from `PROJECT_STATE_DIR`, and all detection
 * reads it. Older workspaces may still hold state in `.nexi` or `.t3team`; those directories
 * stay on disk as a readable fallback, and a one-time migration copies them into `.agents/nexi`
 * without overwriting or deleting anything already there.
 *
 * The env is read through `globalThis.process` so the module stays browser-safe: a browser has
 * no env and therefore resolves the default `.agents/nexi`. Paths a client addresses with a
 * legacy name (`.t3team` or a standalone `.nexi`) are mapped onto the physical one by the
 * server with `toPhysicalProjectStatePath` (idempotent), so the wire vocabulary stays stable
 * across hosts. The workflow journal (`.t3team-runs/`) is a separate directory and is not
 * affected.
 */

import { readFeatureFlag } from "./t3teamFeatureFlags.ts";

/** Legacy canonical name: the wire vocabulary, and the physical dir when the flag is off. */
export const T3TEAM_PROJECT_STATE_DIR = ".t3team";
/** Previous default physical dir, still read as a fallback and migrated from. */
export const LEGACY_NEXI_PROJECT_STATE_DIR = ".nexi";
/** Current physical (and default) dir when the flag is on. */
export const NEXI_PROJECT_STATE_DIR = ".agents/nexi";
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

/**
 * Directories to look in for existing project state, preferred first: the process's physical
 * dir, then the older `.nexi`, then `.t3team`. Duplicates (when the physical dir is already
 * one of those) are dropped.
 */
export function projectStateDirLookupOrder(
  stateDirName: string = PROJECT_STATE_DIR,
): ReadonlyArray<string> {
  const order = [
    stateDirName,
    NEXI_PROJECT_STATE_DIR,
    LEGACY_NEXI_PROJECT_STATE_DIR,
    T3TEAM_PROJECT_STATE_DIR,
  ];
  return [...new Set(order)];
}

/** A whole state-dir segment: `.agents/nexi` (two segments) is listed first so a trailing
 * `.nexi` inside it is not taken as the older single-segment name. */
const STATE_DIR_SEGMENT = /(^|[\\/])(?:\.agents[\\/]nexi|\.t3team|\.nexi)(?=[\\/]|$)/g;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nameForSeparator = (name: string, separator: string): string =>
  name.replace(/[\\/]/g, separator);

const namesEqual = (left: string, right: string): boolean =>
  left.replaceAll("\\", "/") === right.replaceAll("\\", "/");

/** Maps a path addressed with a legacy state dir name onto the physical one: a
 * workspace-relative path (`.t3team/recipes/x` or `.nexi/recipes/x`) or an absolute one
 * (`/ws/.t3team/recipes/x`). The LAST whole state-dir segment is the one being addressed, so
 * unrelated ancestor directories that happen to be named `.t3team` (for example this app's own
 * child-worktree roots) are left alone when the path already contains the physical dir after
 * them. `.t3team-runs/` and paths without a state dir (and already-physical paths) pass through
 * unchanged. */
export function toPhysicalProjectStatePath(
  statePath: string,
  stateDirName: string = PROJECT_STATE_DIR,
): string {
  if (stateDirName === T3TEAM_PROJECT_STATE_DIR) return statePath;
  const normalized = statePath.replace(/^\.\/+/, "");
  const matches = [...normalized.matchAll(STATE_DIR_SEGMENT)];
  if (matches.length === 0) return statePath;
  const last = matches[matches.length - 1]!;
  const leading = last[1] ?? "";
  const matched = last[0].slice(leading.length);
  const separator = matched.includes("\\") || leading === "\\" ? "\\" : "/";
  const physical = nameForSeparator(stateDirName, separator);
  if (namesEqual(matched, stateDirName)) return statePath;
  const tail = normalized.slice(last.index! + last[0].length);
  const alreadyPhysical = new RegExp(
    `(^|[\\\\/])${escapeRegExp(physical)}(?=[\\\\/]|$)`,
  );
  if (alreadyPhysical.test(tail)) return statePath;
  return normalized.slice(0, last.index! + leading.length) + physical + tail;
}

/** The machine-definition pointer's file name, always inside the project state dir. */
export const PROJECT_MACHINE_FILE_NAME = "machine.json";

/** Derive the machine pointer path from a state dir (the process's physical dir by default). */
export function projectMachineFilePath(stateDir: string = PROJECT_STATE_DIR): string {
  return `${stateDir.replace(/[\\/]+$/, "")}/${PROJECT_MACHINE_FILE_NAME}`;
}

/**
 * Where to look for an existing machine pointer, preferred first: the process's physical
 * path, then `.agents/nexi/machine.json`, `.nexi/machine.json`, and `.t3team/machine.json`.
 * Duplicates are dropped. A present file at an earlier path wins, including an invalid one.
 */
export function projectMachineFilePathLookupOrder(
  stateDir: string = PROJECT_STATE_DIR,
): ReadonlyArray<string> {
  return projectStateDirLookupOrder(stateDir).map((dir) => projectMachineFilePath(dir));
}

/** The process's machine pointer path: `.agents/nexi/machine.json` by default. */
export const PROJECT_MACHINE_FILE_PATH = projectMachineFilePath();

/** Locations a discovery message lists as having been checked. */
export function projectMachineCheckedLocations(
  stateDir: string = PROJECT_STATE_DIR,
): string {
  const pointers = projectMachineFilePathLookupOrder(stateDir).join(", ");
  return `${pointers}, .devcontainer/devcontainer.json and .devcontainer.json`;
}

/**
 * Copy-once rule for the machine pointer: never overwrite or delete. The target wins
 * when it is already present; otherwise the first existing fallback is copied.
 */
export function decideMachineFileMigration(input: {
  readonly targetPath: string;
  readonly targetExists: boolean;
  readonly sources: ReadonlyArray<{ readonly path: string; readonly exists: boolean }>;
}): { readonly action: "noop" } | { readonly action: "copy"; readonly source: string } {
  if (input.targetExists) return { action: "noop" };
  const source = input.sources.find((entry) => entry.exists && entry.path !== input.targetPath);
  return source === undefined ? { action: "noop" } : { action: "copy", source: source.path };
}
