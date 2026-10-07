// @effect-diagnostics nodeBuiltinImport:off - reads distribution.json before the Effect runtime is available.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { DesktopAppBranding } from "@t3tools/contracts";

const VENDOR_WINDOW_TITLE = /^T3 Code(?: \((?:Alpha|Dev|Nightly|Latest)\))?$/;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Distribution identity, then the pack theme's label, then the theme product name. */
export function distributionProductNameFromManifest(input: {
  readonly manifest: unknown;
  readonly theme: unknown;
}): string | undefined {
  const branding = asRecord(asRecord(input.manifest)?.branding);
  const fromBranding = nonEmpty(branding?.productName);
  if (fromBranding) return fromBranding;
  const theme = asRecord(input.theme);
  const labels = asRecord(theme?.labels);
  return nonEmpty(labels?.appName) ?? nonEmpty(theme?.productName);
}

export function readDistributionProductName(
  env: Readonly<Record<string, string | undefined>>,
  readFile: (filePath: string) => string | undefined,
): string | undefined {
  const dir = env.T3CODE_DISTRIBUTION?.trim();
  if (!dir) return undefined;
  const raw = readFile(NodePath.join(dir, "distribution.json"));
  if (!raw) return undefined;
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const themeRelative = nonEmpty(asRecord(manifest)?.theme);
  let theme: unknown;
  if (themeRelative) {
    const themeRaw = readFile(NodePath.resolve(dir, themeRelative));
    if (themeRaw) {
      try {
        theme = JSON.parse(themeRaw);
      } catch {
        theme = undefined;
      }
    }
  }
  return distributionProductNameFromManifest({ manifest, theme });
}

export function readDistributionProductNameFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  return readDistributionProductName(env, (filePath) => {
    try {
      return NodeFS.readFileSync(filePath, "utf8");
    } catch {
      return undefined;
    }
  });
}

export function applyDistributionProductName(
  branding: DesktopAppBranding,
  productName: string | undefined,
): DesktopAppBranding {
  if (!productName) return branding;
  return {
    ...branding,
    baseName: productName,
    displayName: `${productName} (${branding.stageLabel})`,
  };
}

/**
 * A pack document title replaces the vendor window title. The static boot title
 * stays the vendor string until the descriptor arrives, so it must not clobber
 * a distribution display name already applied at process start.
 */
export function resolveDesktopWindowTitle(input: {
  readonly displayName: string;
  readonly documentTitle: string | undefined;
}): string {
  const next = input.documentTitle?.trim() ?? "";
  if (next.length > 0 && !VENDOR_WINDOW_TITLE.test(next)) return next;
  return input.displayName;
}
