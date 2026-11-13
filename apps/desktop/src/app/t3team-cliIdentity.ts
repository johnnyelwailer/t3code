/**
 * Isolated Nexi Work CLI names and shim identity. An isolated install uses `nexi`
 * (or `nexi.cmd`) and never writes or removes a `t3` PATH link.
 */

const UPSTREAM_MARKER = "Written by T3 Code: runs the desktop app's bundled t3 CLI.";
export const NEXI_MARKER = "Written by Nexi Work: runs the desktop app's bundled nexi CLI.";

/** Launcher file name inside the app's `bin` directory. */
export function cliBinaryName(input: {
  readonly isolatedInstance: boolean;
  readonly platform: NodeJS.Platform;
}): string {
  const base = input.isolatedInstance ? "nexi" : "t3";
  return input.platform === "win32" ? `${base}.cmd` : base;
}

/** PATH entry name. An isolated Nexi install never uses or removes `t3`. */
export function cliPathLinkName(isolatedInstance: boolean): string {
  return isolatedInstance ? "nexi" : "t3";
}

export function cliShimMarker(
  isolatedInstance: boolean,
  upstreamMarker: string = UPSTREAM_MARKER,
): string {
  return isolatedInstance ? NEXI_MARKER : upstreamMarker;
}

/**
 * Environment variables the isolated CLI shim sets so a launched backend keeps
 * the Nexi identity. Empty when the install is not isolated.
 */
export function isolatedShimEnvVars(input: {
  readonly isolatedInstance?: boolean;
  readonly appId?: string | undefined;
}): ReadonlyArray<{ readonly name: string; readonly value: string }> {
  if (input.isolatedInstance !== true) return [];
  const vars: Array<{ readonly name: string; readonly value: string }> = [
    { name: "T3CODE_DESKTOP_ISOLATED_INSTANCE", value: "1" },
  ];
  const appId = input.appId?.trim();
  if (appId) vars.push({ name: "T3CODE_DESKTOP_APP_ID", value: appId });
  return vars;
}
