/** Upstream labels stay the default so an unbranded t3code build is unchanged. */
export const UPSTREAM_BOOT_SERVICE_NAME = "t3code";
export const UPSTREAM_BOOT_SERVICE_UNIT_FILE = `${UPSTREAM_BOOT_SERVICE_NAME}.service`;
export const UPSTREAM_BOOT_SERVICE_LAUNCHD_LABEL = "com.t3tools.t3code.service";
export const UPSTREAM_BOOT_SERVICE_PLIST_FILE = `${UPSTREAM_BOOT_SERVICE_LAUNCHD_LABEL}.plist`;
export const UPSTREAM_BOOT_SERVICE_DESCRIPTION = "T3 Code server";

export const NEXI_LIVE_APP_ID = "ch.nexplore.nexi.work";
/** Dedicated identity env. Distinct from `T3_BOOT_SERVICE_UNIT`, which means "running inside the service". */
export const BOOT_SERVICE_IDENTITY_ENV = "T3_BOOT_SERVICE_IDENTITY";

export interface BootServiceIdentity {
  readonly name: string;
  readonly unitFile: string;
  readonly launchdLabel: string;
  readonly plistFile: string;
  readonly description: string;
  readonly appId?: string;
}

export function upstreamBootServiceIdentity(): BootServiceIdentity {
  return {
    name: UPSTREAM_BOOT_SERVICE_NAME,
    unitFile: UPSTREAM_BOOT_SERVICE_UNIT_FILE,
    launchdLabel: UPSTREAM_BOOT_SERVICE_LAUNCHD_LABEL,
    plistFile: UPSTREAM_BOOT_SERVICE_PLIST_FILE,
    description: UPSTREAM_BOOT_SERVICE_DESCRIPTION,
  };
}

/**
 * Live Nexi: launchd `ch.nexplore.nexi.work.service`, systemd `nexi-work.service`.
 * Nightlies derive unique names from their appId (`ch.nexplore.nexi.work.nightly` → `nexi-work-nightly.service`).
 */
export function bootServiceIdentityForAppId(appId: string): BootServiceIdentity {
  const trimmed = appId.trim();
  if (!trimmed.startsWith("ch.nexplore.nexi.work")) {
    return upstreamBootServiceIdentity();
  }
  const systemdName = trimmed.replace(/^ch\.nexplore\./, "").replaceAll(".", "-");
  return {
    name: systemdName,
    unitFile: `${systemdName}.service`,
    launchdLabel: `${trimmed}.service`,
    plistFile: `${trimmed}.service.plist`,
    description: "Nexi Work server",
    appId: trimmed,
  };
}

export function resolveBootServiceIdentity(
  env: Record<string, string | undefined> = process.env,
): BootServiceIdentity {
  const explicit = env[BOOT_SERVICE_IDENTITY_ENV]?.trim();
  if (explicit?.startsWith("ch.nexplore.nexi.work")) {
    return bootServiceIdentityForAppId(explicit);
  }
  const appId = env.T3CODE_DESKTOP_APP_ID?.trim();
  if (appId?.startsWith("ch.nexplore.nexi.work")) {
    return bootServiceIdentityForAppId(appId);
  }
  return upstreamBootServiceIdentity();
}
