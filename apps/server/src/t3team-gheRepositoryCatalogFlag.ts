/**
 * Runtime feature flag: GitHub Enterprise hosts get the same full `user/repos` catalog as
 * github.com in the repository picker, which then filters it by what the user types.
 *
 * Layering: `NEXI_FF_GHE_REPOSITORY_CATALOG` env override > feature_flags DB value > code default
 * (on). Off restores the project-title name search for non-github.com hosts, with the full list only
 * as a fallback when that search finds nothing. Read live on every call.
 */
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

type ReadEnv = (key: string) => string | undefined;
const processEnv: ReadEnv = (key) => process.env[key];

export function isGheRepositoryCatalogEnabled(readEnv: ReadEnv = processEnv): boolean {
  return readFeatureFlag("GHE_REPOSITORY_CATALOG", readEnv);
}

/** Whether repository discovery for `host` lists everything the signed-in user can reach. */
export function usesAuthenticatedRepositoryList(
  input: { readonly host: string; readonly repositoriesOnly: boolean },
  readEnv: ReadEnv = processEnv,
): boolean {
  if (!input.repositoriesOnly) return true;
  return input.host.toLowerCase() === "github.com" || isGheRepositoryCatalogEnabled(readEnv);
}
