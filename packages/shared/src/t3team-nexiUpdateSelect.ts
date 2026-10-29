/**
 * Which GHE release the Nexi Work desktop should update to, and which of its assets to install.
 * Pure: the server route feeds it the release list and the desktop trusts only what it returns.
 */
import { compareSemverVersions } from "./semver.ts";

export interface NexiGheAsset {
  readonly id: number;
  readonly name: string;
  readonly size: number;
  readonly state: string;
}

export interface NexiGheRelease {
  readonly tag_name: string;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly body: string | null;
  readonly html_url: string;
  readonly published_at: string | null;
  readonly assets: ReadonlyArray<NexiGheAsset>;
}

export interface NexiRuntime {
  readonly platform: string;
  readonly arch: string;
}

export interface NexiPicked {
  readonly version: string;
  readonly release: NexiGheRelease;
  readonly payload: NexiGheAsset;
  readonly manifest: NexiGheAsset;
}

// Strict on purpose: `parseSemver` in ./semver.ts accepts "1.2" and a leading "v".
const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/u;
const TAG_PREFIX = "desktop-v";

/** The version a `desktop-v*` tag names, or null for any other tag (android-v*, v*, junk). */
export function isEligibleNexiTag(tag: string): string | null {
  if (!tag.startsWith(TAG_PREFIX)) return null;
  const version = tag.slice(TAG_PREFIX.length);
  return RELEASE_VERSION.test(version) ? version : null;
}

export function isSupportedNexiRuntime(runtime: NexiRuntime): boolean {
  return (
    selectNexiPayload(
      [
        { id: 0, name: "x-0.0.0-arm64-mac.zip", size: 0, state: "uploaded" },
        { id: 0, name: "x-0.0.0-x64.exe", size: 0, state: "uploaded" },
        { id: 0, name: "latest-mac.yml", size: 0, state: "uploaded" },
        { id: 0, name: "latest.yml", size: 0, state: "uploaded" },
      ],
      "0.0.0",
      runtime,
    ) !== null
  );
}

const isPrereleaseVersion = (version: string) => version.includes("-");

/**
 * The asset the updater installs on this machine, and the manifest that carries its sha512. The
 * ZIP, not the DMG, on macOS: the app bundle is swapped from it. Only published builds exist:
 * macOS arm64 and Windows x64 (an arm64 Windows runs the x64 installer under emulation).
 */
export function selectNexiPayload(
  assets: ReadonlyArray<NexiGheAsset>,
  version: string,
  runtime: NexiRuntime,
): { readonly payload: NexiGheAsset; readonly manifest: NexiGheAsset } | null {
  const versioned = (asset: NexiGheAsset) => asset.name.includes(`-${version}-`);
  let payloadMatches: (asset: NexiGheAsset) => boolean;
  let manifestName: string;
  if (runtime.platform === "darwin" && runtime.arch === "arm64") {
    payloadMatches = (asset) => asset.name.endsWith("-arm64-mac.zip") && versioned(asset);
    manifestName = "latest-mac.yml";
  } else if (runtime.platform === "win32" && (runtime.arch === "x64" || runtime.arch === "arm64")) {
    payloadMatches = (asset) =>
      asset.name.endsWith(".exe") && asset.name.includes("-x64") && versioned(asset);
    manifestName = "latest.yml";
  } else {
    return null;
  }
  const usable = assets.filter((asset) => asset.state === "uploaded");
  const payload = usable.find(payloadMatches);
  const manifest = usable.find((asset) => asset.name === manifestName);
  return payload && manifest ? { payload, manifest } : null;
}

/**
 * The newest release this build should move to, or null. A pre-release build follows pre-releases
 * and stable releases (every desktop release so far is an rc); a stable build follows stable ones.
 * Drafts, android-v* and other tags never count, and a newer release that lacks the files for this
 * machine is skipped for the next one.
 */
export function pickNexiUpdate(input: {
  readonly releases: ReadonlyArray<NexiGheRelease>;
  readonly currentVersion: string;
  readonly platform: string;
  readonly arch: string;
}): NexiPicked | null {
  const { currentVersion } = input;
  if (!RELEASE_VERSION.test(currentVersion)) return null;
  const followsPrereleases = isPrereleaseVersion(currentVersion);
  const candidates = input.releases
    .flatMap((release) => {
      const version = release.draft ? null : isEligibleNexiTag(release.tag_name);
      if (version === null) return [];
      if (!followsPrereleases && (release.prerelease || isPrereleaseVersion(version))) return [];
      if (compareSemverVersions(version, currentVersion) <= 0) return [];
      return [{ version, release }];
    })
    .sort((left, right) => compareSemverVersions(right.version, left.version));
  for (const { version, release } of candidates) {
    const files = selectNexiPayload(release.assets, version, input);
    if (files) return { version, release, ...files };
  }
  return null;
}

export interface NexiUpdateManifest {
  readonly version: string;
  readonly path: string;
  readonly sha512: string;
  readonly size: number;
}

/** Reads the top-level keys of the `latest*.yml` that dev/scripts/desktop-update-manifest.mjs writes. */
export function parseNexiUpdateManifest(text: string): NexiUpdateManifest | null {
  const top = (key: string) => new RegExp(`^${key}: (.+)$`, "mu").exec(text)?.[1]?.trim();
  const version = top("version");
  const path = top("path");
  const sha512 = top("sha512");
  const size = /^ {4}size: (\d+)$/mu.exec(text)?.[1];
  if (version === undefined || path === undefined || sha512 === undefined || size === undefined) {
    return null;
  }
  // 64 bytes in base64: electron-updater compares exactly this string.
  if (!/^[A-Za-z0-9+/]{86}==$/u.test(sha512)) return null;
  if (!RELEASE_VERSION.test(version) || path.includes("/") || path.includes("\\")) return null;
  return { version, path, sha512, size: Number(size) };
}
