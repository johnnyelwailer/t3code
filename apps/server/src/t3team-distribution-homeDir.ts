import { distributionBranding } from "./t3team-distribution.ts";

/**
 * The distribution's user-data directory name, normalized to the form
 * `resolveBaseDir` expects (leading dot included, e.g. `.t3` / `.nexi`),
 * or `undefined` when the distribution does not brand a home directory.
 *
 * Isolated in its own module: command modules must stay lean for type
 * inference, so they import this value instead of the distribution module.
 */
export const distributionHomeDirName: string | undefined = (() => {
  const name = distributionBranding?.userDataDirName;
  return name ? (name.startsWith(".") ? name : `.${name}`) : undefined;
})();
