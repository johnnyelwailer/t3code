/**
 * Where project state lives on disk, beyond the one write dir: the legacy `.nexi` is still READ.
 * The constants and the canonical-to-physical mapping stay in `t3teamProjectStateDir`.
 */
import {
  NEXI_PROJECT_STATE_DIR,
  PROJECT_STATE_DIR,
  T3TEAM_PROJECT_STATE_DIR,
} from "./t3teamProjectStateDir.ts";

/** The state dir name before `.agents/nexi`. Still read, never written. */
export const LEGACY_NEXI_PROJECT_STATE_DIR = ".nexi";

/** Every state dir name a project may carry on disk, newest first: where to look, in order. The
 * first entry is where new state is written and wins on conflict. `.t3team` is not read here: it
 * is the wire vocabulary and the flag-off dir, and is copied forward once. */
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
