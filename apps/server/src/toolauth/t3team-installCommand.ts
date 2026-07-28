/**
 * Builds the argv for installing a CLI via npm, and nothing else.
 *
 * A plain function, not a code path: it takes a package name (always drawn
 * from the static `TOOL_INSTALL_PACKAGES` table in `installPackages.ts`, never
 * client input) and returns a plain string array. The caller spawns it
 * through `PtyAdapter` exactly like `ToolAuthService` spawns a CLI login —
 * no shell, no string interpolation into a command line, so there is no
 * injection surface even if the package name were ever attacker-controlled.
 *
 * @module toolauth/installCommand
 */

/** Argv for a global npm install of `npmPackageName` at `@latest`. */
export function buildNpmInstallArgv(npmPackageName: string): string[] {
  return ["npm", "install", "-g", `${npmPackageName}@latest`];
}
