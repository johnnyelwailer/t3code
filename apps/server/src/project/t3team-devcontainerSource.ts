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

const DevcontainerSource = Schema.Struct({
  image: Schema.optional(Schema.String),
  build: Schema.optional(Schema.Struct({ dockerfile: Schema.optional(Schema.String) })),
  /** The spec's deprecated spelling of `build.dockerfile`. */
  dockerFile: Schema.optional(Schema.String),
  dockerComposeFile: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
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

/** The directory of a repository path, `""` for the repository root. */
export const repositoryDirname = (repositoryPath: string) =>
  repositoryPath.split("/").slice(0, -1).join("/");

/** The definition hash: path and contents of every file that defines the build, order-independent. */
export function hashDefinitionFiles(
  files: ReadonlyArray<{ readonly path: string; readonly contents: string }>,
): string {
  const hash = NodeCrypto.createHash("sha256");
  for (const file of files.toSorted((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path).update("\0").update(file.contents).update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}
