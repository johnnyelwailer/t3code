import * as Effect from "effect/Effect";
import type { VcsProcessShape } from "./vcs/VcsProcess.ts";
import { readTrimmedString } from "./t3work-github-routes-shared.ts";

export function loadAccount(
  vcs: VcsProcessShape,
  host: string,
): Effect.Effect<string | undefined, never, never> {
  return vcs
    .run({
      operation: "t3work.github.account",
      command: "gh",
      args: ["api", "user", "--hostname", host, "--jq", ".login"],
      cwd: process.cwd(),
    })
    .pipe(
      Effect.map((output) => readTrimmedString(output.stdout)),
      Effect.orElseSucceed(() => undefined),
    );
}
