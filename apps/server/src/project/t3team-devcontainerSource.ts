// @effect-diagnostics nodeBuiltinImport:off -- Plain sync sha256 hash; the stable digest must stay byte-identical, not become an Effect requiring Crypto.
/**
 * What a `devcontainer.json` builds from — the only part of the file a machine definition needs
 * to understand. Everything else (features, customizations, lifecycle commands) is left to the
 * devcontainer CLI that runs the build.
 *
 * @module t3team-devcontainerSource
 */
import * as NodeCrypto from "node:crypto";

import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Schema from "effect/Schema";

// A blank source is no source: `"image": ""` must not pass as a buildable definition. Validated,
// never trimmed — a reference is a filename, and `" Dockerfile"` is not `"Dockerfile"`.
const NonBlank = Schema.String.check(Schema.makeFilter((value) => value.trim().length > 0));
const DevcontainerSource = Schema.Struct({
  image: Schema.optional(NonBlank),
  build: Schema.optional(Schema.Struct({ dockerfile: Schema.optional(NonBlank) })),
  /** The spec's deprecated spelling of `build.dockerfile`. */
  dockerFile: Schema.optional(NonBlank),
  dockerComposeFile: Schema.optional(Schema.Union([NonBlank, Schema.Array(NonBlank)])),
});
const decodeDevcontainer = Schema.decodeUnknownResult(fromLenientJson(DevcontainerSource));

/**
 * The files a devcontainer's build reads besides itself, relative to the devcontainer's own
 * directory (as the spec resolves them), or why it cannot be built from. JSONC is accepted, as
 * the spec allows comments and trailing commas.
 */
export function devcontainerBuildReferences(
  contents: string,
): { readonly references: ReadonlyArray<string> } | { readonly error: string } {
  const decoded = decodeDevcontainer(contents);
  if (decoded._tag === "Failure") return { error: "is not a valid devcontainer.json" };
  const source = decoded.success;
  const dockerfile = source.build?.dockerfile ?? source.dockerFile;
  const compose =
    source.dockerComposeFile === undefined
      ? []
      : typeof source.dockerComposeFile === "string"
        ? [source.dockerComposeFile]
        : source.dockerComposeFile;
  const sources = [source.image, dockerfile, compose.length > 0 ? compose : undefined];
  if (sources.filter((entry) => entry !== undefined).length !== 1) {
    return { error: "must name exactly one of image, build.dockerfile or dockerComposeFile" };
  }
  return { references: [...(dockerfile === undefined ? [] : [dockerfile]), ...compose] };
}

/**
 * A `/`-separated repository path with `.` and `..` resolved, or null when it is absolute or
 * climbs out of the repository.
 */
export function resolveRepositoryPath(relative: string): string | null {
  if (relative.startsWith("/") || relative.includes("\\") || /^[A-Za-z]:/.test(relative)) {
    return null;
  }
  const segments: Array<string> = [];
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") segments.push(segment);
    else if (segments.pop() === undefined) return null;
  }
  return segments.length === 0 ? null : segments.join("/");
}

/**
 * A build reference (`build.dockerfile`, a compose file) resolved against the directory of the
 * devcontainer that names it, as the spec resolves them; null when it is absolute or leaves the
 * repository. The reference is checked before joining, so `/Dockerfile` cannot pass as relative.
 */
export function resolveBuildReference(devcontainerPath: string, reference: string): string | null {
  if (reference.startsWith("/") || reference.includes("\\") || /^[A-Za-z]:/.test(reference)) {
    return null;
  }
  const directory = devcontainerPath.split("/").slice(0, -1).join("/");
  return resolveRepositoryPath(directory === "" ? reference : `${directory}/${reference}`);
}

/**
 * The definition hash: path and contents of every file that defines the build, order-independent.
 * Ordered by code unit, never by locale, so every machine computes the same hash.
 */
export function hashDefinitionFiles(
  files: ReadonlyArray<{ readonly path: string; readonly contents: string }>,
): string {
  const hash = NodeCrypto.createHash("sha256");
  for (const file of files.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(file.path).update("\0").update(file.contents).update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}
