/**
 * The files a recipe config pulls in through relative imports, transitively. The loader uses the
 * list twice: every file must lie under the project's state dir (a config may not reach into the
 * rest of the machine), and every file's modification time is part of the config's version, so
 * an edit to a helper two imports down reloads the config too. Bare specifiers (the SDK, packages
 * a policy file uses) are not followed: they are not the project's to edit.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const RELATIVE_SPECIFIER =
  /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\sfrom\s+)?["'](\.{1,2}\/[^"']+)["']/g;
const MAX_FILES = 64;

export interface ConfigImportGraph {
  /** Every file reached, the config first. */
  readonly files: ReadonlyArray<string>;
  /** Reached files outside the state dir. */
  readonly outside: ReadonlyArray<string>;
}

export const collectConfigImports = Effect.fn("collectConfigImports")(function* (
  entry: string,
  stateRoot: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const inside = (file: string) => {
    const relative = path.relative(stateRoot, file);
    return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  const files: string[] = [];
  const outside: string[] = [];
  const queue = [entry];
  while (queue.length > 0 && files.length < MAX_FILES) {
    const file = queue.shift()!;
    if (files.includes(file)) continue;
    files.push(file);
    if (!inside(file)) {
      outside.push(file);
      continue;
    }
    const text = yield* fileSystem.readFileString(file).pipe(Effect.orElseSucceed(() => ""));
    for (const match of text.matchAll(RELATIVE_SPECIFIER)) {
      queue.push(path.resolve(path.dirname(file), match[1]!));
    }
  }
  return { files, outside } satisfies ConfigImportGraph;
});
