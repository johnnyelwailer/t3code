/**
 * Finds a checkout that is already on disk for a linked repository whose manifest entry is gone
 * (the manifest was reset, or an older version wrote it differently). Reference directories are
 * named `<NN>-<host>-<owner>-<repo>`, and `NN` is only the repository's position in the list when
 * it was first cloned, so the same repository can come back under a different `NN`. Matching on
 * the slug keeps the existing clone instead of downloading the repository a second time.
 *
 * @module t3team-linkedRepositoryExistingCheckout
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { deriveReferenceDirectoryName } from "./t3team-project-repository-utils.ts";

const ORDINAL_PREFIX = /^\d+-/;

export const findExistingLinkedCheckout = Effect.fn("findExistingLinkedCheckout")(
  function* (input: {
    readonly referencesRoot: string;
    readonly url: string;
    /** Directories already assigned to another repository in this plan. */
    readonly taken: ReadonlySet<string>;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const slug = deriveReferenceDirectoryName(input.url);
    const names = yield* fileSystem
      .readDirectory(input.referencesRoot)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    for (const name of names) {
      if (name.startsWith(".") || name.replace(ORDINAL_PREFIX, "") !== slug) continue;
      const candidate = path.join(input.referencesRoot, name);
      if (input.taken.has(candidate)) continue;
      const isCheckout = yield* fileSystem
        .exists(path.join(candidate, ".git"))
        .pipe(Effect.orElseSucceed(() => false));
      if (isCheckout) return candidate;
    }
    return undefined;
  },
);
