/**
 * Isolated Nexi Work custom URL scheme. An isolated instance uses `nexi-work://`
 * so it can run next to a t3code install that uses `t3code://`.
 */

export const NEXI_WORK_SCHEME = "nexi-work";

/** Same host as ElectronProtocol.DESKTOP_HOST. */
const DESKTOP_HOST = "app";
/** Same values as ElectronProtocol's private DESKTOP_*_SCHEME constants. */
const UPSTREAM_PRODUCTION_SCHEME = "t3code";
const UPSTREAM_DEVELOPMENT_SCHEME = "t3code-dev";

export type DesktopSchemeOptions = {
  readonly isolatedInstance?: boolean;
};

export function getDesktopScheme(isDevelopment: boolean, options?: DesktopSchemeOptions): string {
  if (options?.isolatedInstance) return NEXI_WORK_SCHEME;
  return isDevelopment ? UPSTREAM_DEVELOPMENT_SCHEME : UPSTREAM_PRODUCTION_SCHEME;
}

export function getDesktopUrl(isDevelopment: boolean, options?: DesktopSchemeOptions): string {
  return `${getDesktopScheme(isDevelopment, options)}://${DESKTOP_HOST}/`;
}

/** Privileged-scheme entry registered next to the upstream t3code schemes, before Electron is ready. */
export function isolatedDesktopSchemePrivileges(): ReadonlyArray<{
  readonly scheme: string;
  readonly privileges: {
    readonly standard: true;
    readonly secure: true;
    readonly supportFetchAPI: true;
    readonly corsEnabled: true;
    readonly stream: true;
    readonly codeCache: true;
  };
}> {
  return [
    {
      scheme: NEXI_WORK_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
      },
    },
  ];
}
