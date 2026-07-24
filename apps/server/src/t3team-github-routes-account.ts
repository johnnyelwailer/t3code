import * as Effect from "effect/Effect";
import type { VcsProcessShape } from "./t3team-vcsProcessShape.ts";
import { readTrimmedString } from "./t3team-github-routes-shared.ts";

export function loadAccount(
  vcs: VcsProcessShape,
  host: string,
): Effect.Effect<string | undefined, never, never> {
  return vcs
    .run({
      operation: "t3team.github.account",
      command: "gh",
      args: ["api", "user", "--hostname", host, "--jq", ".login"],
      cwd: process.cwd(),
    })
    .pipe(
      Effect.map((output) => readTrimmedString(output.stdout)),
      Effect.orElseSucceed(() => undefined),
    );
}
