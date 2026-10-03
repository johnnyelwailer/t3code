/**
 * Runtime feature flag: project main repository — designate one linked repository as the
 * project's main repository (its checkout becomes the shared workspace and holds the state
 * dir), switch it with state migration, auto-detect it from linked clones, and default
 * `t3team.thread.start_child` worktree isolation to it.
 *
 * The server advertises the flag to clients through `ServerConfig.mainRepository`.
 *
 * Layering (owner flag rule): `NEXI_FF_MAIN_REPOSITORY` env override > code default (off).
 * Read live on every call, so the flag is toggleable per process without a rebuild.
 */

/** Environment override for the main-repository flag. `1`/`true`/`on` on, anything else off. */
export const MAIN_REPOSITORY_FLAG_ENV = "NEXI_FF_MAIN_REPOSITORY";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isMainRepositoryEnabled(readEnv: ReadEnv = processEnv): boolean {
  const raw = readEnv(MAIN_REPOSITORY_FLAG_ENV)?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
