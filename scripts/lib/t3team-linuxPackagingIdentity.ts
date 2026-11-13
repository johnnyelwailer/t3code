/**
 * Linux packaging identity for a desktop build. A branded or unique-appId
 * build uses its own executable name, WM_CLASS, AppStream id and doc path so
 * it can be installed next to upstream t3code.
 */
import { DEFAULT_DESKTOP_APP_ID } from "./t3team-releaseFlavor.ts";

export const UPSTREAM_LINUX_EXECUTABLE_NAME = "t3code";
export const UPSTREAM_LINUX_METAINFO_ID = "com.t3tools.t3code";
export const UPSTREAM_LINUX_DOC_DIR = "t3code";
export const UPSTREAM_LINUX_DESKTOP_ENTRY = "t3code.desktop";

export function slugifyDesktopFilesystemName(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || UPSTREAM_LINUX_EXECUTABLE_NAME
  );
}

export interface LinuxPackagingIdentity {
  readonly executableName: string;
  readonly startupWmClass: string;
  readonly metainfoId: string;
  readonly desktopEntryName: string;
  readonly docDir: string;
  readonly branded: boolean;
}

export function resolveLinuxPackagingIdentity(input: {
  readonly appId: string;
  readonly productNameOverride?: string | undefined;
}): LinuxPackagingIdentity {
  const product = input.productNameOverride?.trim();
  const branded = Boolean(product) || input.appId !== DEFAULT_DESKTOP_APP_ID;
  if (!branded) {
    return {
      executableName: UPSTREAM_LINUX_EXECUTABLE_NAME,
      startupWmClass: UPSTREAM_LINUX_EXECUTABLE_NAME,
      metainfoId: UPSTREAM_LINUX_METAINFO_ID,
      desktopEntryName: UPSTREAM_LINUX_DESKTOP_ENTRY,
      docDir: UPSTREAM_LINUX_DOC_DIR,
      branded: false,
    };
  }
  const slug = slugifyDesktopFilesystemName(product || input.appId);
  return {
    executableName: slug,
    startupWmClass: slug,
    metainfoId: input.appId,
    desktopEntryName: `${slug}.desktop`,
    docDir: slug,
    branded: true,
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** AppStream metainfo for a branded Linux package. */
export function renderLinuxMetainfoXml(input: {
  readonly appId: string;
  readonly productName: string;
  readonly executableName: string;
  readonly desktopEntryName: string;
  readonly summary?: string;
}): string {
  const id = escapeXml(input.appId);
  const name = escapeXml(input.productName);
  const executable = escapeXml(input.executableName);
  const desktop = escapeXml(input.desktopEntryName);
  const summary = escapeXml(input.summary ?? "Desktop GUI for coding agents");
  const developerId = escapeXml(input.appId.split(".").slice(0, -1).join(".") || input.appId);
  return `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${id}</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>
  <name>${name}</name>
  <summary>${summary}</summary>
  <developer id="${developerId}">
    <name>${name}</name>
  </developer>
  <description>
    <p>
      ${name} is a desktop app for coding agents. Work with your existing
      agent subscriptions, review code changes, and run commands in your
      projects.
    </p>
  </description>
  <launchable type="desktop-id">${desktop}</launchable>
  <icon type="stock">${executable}</icon>
  <provides>
    <binary>${executable}</binary>
  </provides>
  <categories>
    <category>Development</category>
  </categories>
</component>
`;
}
