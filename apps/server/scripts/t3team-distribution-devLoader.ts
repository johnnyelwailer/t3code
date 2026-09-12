/**
 * `@t3code/distribution` resolution for SOURCE RUNS (dev, `node --watch`).
 *
 * The server source imports the virtual module `@t3code/distribution` in exactly two places
 * (`cli/config.ts`, `cli/pair.ts`). Two mechanisms already resolve it:
 *
 * - the PACKED build: `scripts/t3team-distributionPackPlugin.ts` inlines the distribution (or a
 *   stub) at bundle time;
 * - typechecking: `tsconfig.base.json` `paths` maps it to `src/t3team-distribution.ts`.
 *
 * Source runs (plain `node --watch src/bin.ts`, native type stripping) honour neither: Node's
 * ESM resolver has no tsconfig `paths` support, and the stub cannot live under `node_modules`
 * because Node refuses to type-strip anything that resolves through `node_modules`
 * (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). This loader is the third, source-run mechanism:
 * a Node module hook that maps the bare specifier onto the stub, mirroring the pack plugin and
 * the tsconfig alias. It registers synchronously via `module.registerHooks` (same thread, no
 * `--loader` worker) so it composes with `--watch` and with type stripping of the entry itself.
 *
 * The stub (`src/t3team-distribution.ts`) already implements the dev semantics: theme and
 * branding read from `T3CODE_DISTRIBUTION` at runtime, provider/pack content arriving later
 * through the `T3TEAM_PACKS_DIR` runtime pack loader. No behaviour is added here — only the
 * resolution.
 */
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SPECIFIER = "@t3code/distribution";
const STUB_URL = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "t3team-distribution.ts"),
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === SPECIFIER) {
      // shortCircuit: the mapping is total for this specifier; nothing downstream may override it.
      return { url: STUB_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
