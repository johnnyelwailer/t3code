/**
 * Records a background sync's outcome in a reference manifest: the matching linked-repository
 * entry is replaced, everything else in the file is kept as written. A repository removed from
 * the manifest while its sync ran is not re-added.
 *
 * @module t3team-linkedRepositoryManifestEntry
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeFileStringAtomically } from "./atomicWrite.ts";
import {
  formatReferenceManifestJson,
  MANIFEST_FILE_NAME,
  type LinkedRepositoryBootstrapResult,
  type ReferenceManifestFile,
} from "./t3team-project-repository-utils.ts";

const decodeManifestObject = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

export const recordLinkedRepositoryOutcome = Effect.fn("recordLinkedRepositoryOutcome")(function* (
  referencesRoot: string,
  entry: LinkedRepositoryBootstrapResult,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifestPath = path.join(referencesRoot, MANIFEST_FILE_NAME);
  const raw = yield* fileSystem.readFileString(manifestPath).pipe(Effect.orElseSucceed(() => ""));
  const decoded = decodeManifestObject(raw);
  if (Option.isNone(decoded)) return;
  const manifest = decoded.value;
  const current = manifest.linkedRepositories;
  if (!Array.isArray(current)) return;
  let matched = false;
  const linkedRepositories = current.map((current: unknown) => {
    const url = (current as { readonly url?: unknown } | null)?.url;
    if (url !== entry.url) return current;
    matched = true;
    return entry;
  });
  if (!matched) return;
  yield* writeFileStringAtomically({
    filePath: manifestPath,
    // Every other field is written back as it was read.
    contents: formatReferenceManifestJson({
      ...manifest,
      linkedRepositories,
    } as unknown as ReferenceManifestFile),
  });
});
