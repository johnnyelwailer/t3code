import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { MAX_DEFINITION_FILE_BYTES, Rejected } from "./t3team-machineDefinitionReader.ts";
import { scanDefinition } from "./t3team-machineDefinitionScan.ts";

export const scanCheckout = Effect.fn("projectMachine.scanCheckout")(function* (input: {
  readonly repository: string;
  readonly root: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const realRoot = yield* fileSystem.realPath(input.root).pipe(Effect.orElseSucceed(() => null));
  if (realRoot === null) return { candidates: [], rejected: [] };
  const read = Effect.fn("projectMachine.readLocalDefinition")(function* (normalized: string) {
    const absolute = path.join(input.root, normalized);
    if (!(yield* fileSystem.exists(absolute).pipe(Effect.orElseSucceed(() => false)))) {
      return null;
    }
    const real = yield* fileSystem.realPath(absolute).pipe(Effect.orElseSucceed(() => null));
    if (real === null || !(real === realRoot || real.startsWith(realRoot + path.sep))) {
      return yield* new Rejected({ reason: `${normalized} links outside the repository.` });
    }
    const info = yield* fileSystem.stat(real).pipe(Effect.orElseSucceed(() => null));
    if (info === null) return null;
    // Something other than a file where a definition belongs is a broken definition, not none.
    if (info.type !== "File") {
      return yield* new Rejected({ reason: `${normalized} is not a file.` });
    }
    if (Number(info.size) > MAX_DEFINITION_FILE_BYTES) {
      return yield* new Rejected({ reason: `${normalized} is larger than 1 MB.` });
    }
    const contents = yield* fileSystem
      .readFileString(real)
      .pipe(Effect.mapError(() => new Rejected({ reason: `${normalized} could not be read.` })));
    return contents;
  });
  const nestedPaths = fileSystem.readDirectory(path.join(input.root, ".devcontainer")).pipe(
    Effect.orElseSucceed((): Array<string> => []),
    Effect.map((entries) =>
      entries.toSorted().map((entry) => `.devcontainer/${entry}/devcontainer.json`),
    ),
  );
  return yield* scanDefinition({ repository: input.repository, reader: { read, nestedPaths } });
});
