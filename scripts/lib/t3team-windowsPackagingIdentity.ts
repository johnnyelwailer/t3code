/**
 * Isolated Nexi: own package name (install dir), exe, NSIS GUID, publisher,
 * and nexi-work://. Unisolated (replace/upstream) builds stay t3code.
 * One-click per-user NSIS uses staged `name` for APP_FILENAME, not productName.
 */
import * as NodeCrypto from "node:crypto";

import {
  DEFAULT_DESKTOP_APP_ID,
  resolveDesktopAppId,
} from "./t3team-releaseFlavor.ts";
import {
  isIsolatedInstanceBuild,
  LIVE_NEXI_APP_ID,
  t3codeProtocolClaims,
} from "./t3team-isolatedInstanceEnv.ts";

/** electron-builder's namespace for NSIS GUID v5 (app-builder-lib NsisTarget). */
export const ELECTRON_BUILDER_NSIS_GUID_NAMESPACE = "50e065bc-3134-11e6-9bab-38c9862bdaf3";

export const UPSTREAM_WINDOWS_PACKAGE_NAME = "t3code";
export const UPSTREAM_WINDOWS_PUBLISHER = "T3 Tools";
export const UPSTREAM_WINDOWS_EXECUTABLE_NAME = undefined;
export const NEXI_WINDOWS_PACKAGE_NAME = "nexi-work";
export const NEXI_WINDOWS_EXECUTABLE_NAME = "nexi-work";
export const NEXI_WINDOWS_PUBLISHER = "Nexplore";
export const NEXI_WINDOWS_DISPLAY_NAME = "Nexi Work";
export const UPSTREAM_INSTALL_DIR_NAME = "t3code";
export const NEXI_INSTALL_DIR_NAME = "nexi-work";
export const UPSTREAM_NSIS_INCLUDE = "apps/desktop/resources/installer.nsh";
export const NEXI_NSIS_INCLUDE = "apps/desktop/resources/t3team-installer.nsh";

type Env = Readonly<Record<string, string | undefined>>;

function parseGuidNamespace(value: string): Buffer {
  const hex = value.replaceAll("-", "");
  return Buffer.from(hex, "hex");
}

/** UUID v5, same algorithm electron-builder uses for `nsis.guid`. */
export function electronBuilderNsisGuid(appId: string): string {
  const hash = NodeCrypto.createHash("sha1")
    .update(parseGuidNamespace(ELECTRON_BUILDER_NSIS_GUID_NAMESPACE))
    .update(appId)
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UPSTREAM_NSIS_GUID = electronBuilderNsisGuid(DEFAULT_DESKTOP_APP_ID);
export const NEXI_LIVE_NSIS_GUID = electronBuilderNsisGuid(LIVE_NEXI_APP_ID);

export interface WindowsPackagingIdentity {
  readonly isolated: boolean;
  readonly appId: string;
  readonly packageName: string;
  readonly installDirName: string;
  readonly executableName: string | undefined;
  readonly publisher: string;
  readonly displayName: string;
  readonly guid: string;
  readonly uninstallDisplayName: string;
  readonly shortcutName: string;
  readonly nsisInclude: string;
  readonly protocols: ReadonlyArray<{ readonly name: string; readonly schemes: readonly string[] }>;
  readonly author: string;
}

/**
 * Isolated Nexi: own dir, exe, GUID, publisher, and `nexi-work://` only.
 * Anything else (upstream, or a replace flavor that is not isolated) is the
 * historical t3code identity — the generated builder config must stay identical.
 */
export function resolveWindowsPackagingIdentity(input: {
  readonly env?: Env;
  readonly appId?: string;
  readonly productName?: string;
}): WindowsPackagingIdentity {
  const env = input.env ?? {};
  const appId = input.appId?.trim() || resolveDesktopAppId(env);
  const isolated = isIsolatedInstanceBuild(env);
  const product = input.productName?.trim() || NEXI_WINDOWS_DISPLAY_NAME;
  if (!isolated) {
    return {
      isolated: false,
      appId,
      packageName: UPSTREAM_WINDOWS_PACKAGE_NAME,
      installDirName: UPSTREAM_INSTALL_DIR_NAME,
      executableName: UPSTREAM_WINDOWS_EXECUTABLE_NAME,
      publisher: UPSTREAM_WINDOWS_PUBLISHER,
      displayName: product,
      guid: electronBuilderNsisGuid(appId),
      uninstallDisplayName: product,
      shortcutName: product,
      nsisInclude: UPSTREAM_NSIS_INCLUDE,
      protocols: [...t3codeProtocolClaims(env)],
      author: UPSTREAM_WINDOWS_PUBLISHER,
    };
  }
  return {
    isolated: true,
    appId,
    packageName: NEXI_WINDOWS_PACKAGE_NAME,
    installDirName: NEXI_INSTALL_DIR_NAME,
    executableName: NEXI_WINDOWS_EXECUTABLE_NAME,
    publisher: NEXI_WINDOWS_PUBLISHER,
    displayName: product,
    guid: electronBuilderNsisGuid(appId),
    uninstallDisplayName: product,
    shortcutName: product,
    nsisInclude: NEXI_NSIS_INCLUDE,
    protocols: [...t3codeProtocolClaims(env)],
    author: NEXI_WINDOWS_PUBLISHER,
  };
}

/** NSIS options for `createBuildConfig`. Upstream is exactly the historical pair of keys. */
export function windowsNsisOptions(identity: WindowsPackagingIdentity): Record<string, unknown> {
  const nsis: Record<string, unknown> = {
    differentialPackage: true,
    include: identity.nsisInclude,
  };
  if (!identity.isolated) return nsis;
  nsis.guid = identity.guid;
  nsis.uninstallDisplayName = identity.uninstallDisplayName;
  nsis.shortcutName = identity.shortcutName;
  return nsis;
}

/**
 * Whether a Windows Add/Remove Programs entry is the stale rc.16-era Nexi
 * install (same GUID as upstream t3code) and may have its *registry key*
 * removed. Never true for a T3 Code entry. Callers must not delete files.
 */
export function isStaleNexiUninstallEntry(input: {
  readonly displayName?: string | undefined;
  readonly publisher?: string | undefined;
  readonly installLocation?: string | undefined;
}): boolean {
  const display = (input.displayName ?? "").trim();
  const publisher = (input.publisher ?? "").trim();
  if (!display || !publisher) return false;
  const isT3Code = /^t3\s*code\b/i.test(display) || /t3 tools/i.test(publisher);
  if (isT3Code) return false;
  const isNexiName = /^nexi\s*work\b/i.test(display) || /^nexi\b/i.test(display);
  const isNexiPublisher = /^nexplore$/i.test(publisher) || /^nexi\b/i.test(publisher);
  if (!isNexiName || !isNexiPublisher) return false;
  const location = (input.installLocation ?? "").trim();
  // A path is supporting evidence, not a veto: rc.16 lived in Programs\t3code.
  // An upstream T3 Code entry is already rejected by DisplayName/publisher.
  void location;
  return true;
}

export function protocolSchemesOf(
  identity: WindowsPackagingIdentity,
): readonly string[] {
  return identity.protocols.flatMap((claim) => [...claim.schemes]);
}

export function overlapsUpstreamWindowsIdentity(identity: WindowsPackagingIdentity): readonly string[] {
  const clashes: string[] = [];
  if (identity.packageName.toLowerCase() === UPSTREAM_WINDOWS_PACKAGE_NAME) {
    clashes.push(`packageName: ${identity.packageName}`);
  }
  if (identity.installDirName.toLowerCase() === UPSTREAM_INSTALL_DIR_NAME) {
    clashes.push(`installDirName: ${identity.installDirName}`);
  }
  if (identity.guid.toLowerCase() === UPSTREAM_NSIS_GUID.toLowerCase()) {
    clashes.push(`guid: ${identity.guid}`);
  }
  if (identity.appId.toLowerCase() === DEFAULT_DESKTOP_APP_ID.toLowerCase()) {
    clashes.push(`appId: ${identity.appId}`);
  }
  if ((identity.executableName ?? "").toLowerCase() === "t3code") {
    clashes.push(`executableName: ${identity.executableName}`);
  }
  for (const scheme of protocolSchemesOf(identity)) {
    if (scheme === "t3code" || scheme === "t3code-dev") {
      clashes.push(`protocol: ${scheme}`);
    }
  }
  return clashes;
}
