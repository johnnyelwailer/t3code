// @effect-diagnostics nodeBuiltinImport:off - build script resolves paths outside the Effect runtime.
import * as NodePath from "node:path";

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

/**
 * Installer background for a distribution build.
 *
 * `T3CODE_DESKTOP_DMG_BACKGROUND` wins. Otherwise `distribution.json`
 * `branding.dmgBackground` is a path relative to the distribution directory,
 * or `{ latest, nightly }` when the channels differ. Absent means the vendor
 * SVG staged with the desktop resources.
 */
export function resolveDmgBackgroundOverride(input: {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly channel: "latest" | "nightly";
  readonly readFile: (filePath: string) => string | undefined;
}): string | undefined {
  const explicit = nonEmpty(input.env.T3CODE_DESKTOP_DMG_BACKGROUND);
  if (explicit) return explicit;
  const dir = input.env.T3CODE_DISTRIBUTION?.trim();
  if (!dir) return undefined;
  const raw = input.readFile(NodePath.join(dir, "distribution.json"));
  if (!raw) return undefined;
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const value = asRecord(asRecord(manifest)?.branding)?.dmgBackground;
  const relative = nonEmpty(value) ?? nonEmpty(asRecord(value)?.[input.channel]);
  if (!relative) return undefined;
  return NodePath.resolve(dir, relative);
}
