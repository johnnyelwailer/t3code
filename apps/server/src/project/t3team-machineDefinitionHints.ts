/**
 * Setup-related files next to a definition: a Dockerfile, an .npmrc, an .env.example, bootstrap
 * scripts. Existence only, so an agent knows what a machine for this repository needs without
 * reading anything. Best effort: a probe that fails reports the file as absent.
 *
 * @module t3team-machineDefinitionHints
 */
import * as Effect from "effect/Effect";

import { providerCall } from "./t3team-machineDefinitionProviderCall.ts";
import type { RemoteMachineTarget } from "./t3team-remoteMachineScan.ts";

export const SETUP_HINT_PATHS = [
  "Dockerfile",
  ".npmrc",
  ".env.example",
  "scripts/bootstrap.sh",
  "scripts/setup.sh",
] as const;

/** The setup files present at `commit`. */
export const probeSetupHints = Effect.fn("machineSearch.probeSetupHints")(function* (
  target: RemoteMachineTarget,
  commit: string,
) {
  const present = yield* Effect.forEach(
    SETUP_HINT_PATHS,
    (path) =>
      providerCall(
        target,
        target.read({
          cwd: target.cwd,
          repository: target.repository,
          host: target.host,
          revision: commit,
          path,
          maxBytes: 1,
        }),
      ).pipe(
        Effect.map((file) => (file === null ? [] : [path])),
        Effect.orElseSucceed(() => []),
      ),
    { concurrency: 4 },
  );
  return present.flat();
});
