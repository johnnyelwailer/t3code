// @effect-diagnostics nodeBuiltinImport:off - build-time checks; run inside the bundler, outside any Effect runtime.
/**
 * What a pack web module may depend on, checked at BUILD time by the web plugin that compiles it
 * into the host app: the `pack-ui` versions it was written against, and the modules it imports.
 *
 * A pack reaches the host only through `@t3team/pack-ui`, plus `react` and `effect` (resolved to
 * the app's own copies) and its own files. That keeps a host upgrade safe for packs; it is not a
 * sandbox — pack code runs with the app's trust.
 */
import * as NodePath from "node:path";

const PACK_UI_CAPABILITY = /^pack-ui:(\d+)(?:-(\d+))?$/;

/**
 * Why a pack with views cannot be built against host `pack-ui` version `hostVersion`, or `null`.
 * The pack declares one `compatibility.hostCapabilities` entry `pack-ui:N`, or an inclusive range
 * `pack-ui:N-M`.
 */
export function packUiCompatibilityProblem(
  hostCapabilities: ReadonlyArray<string> | undefined,
  hostVersion: number,
): string | null {
  const declared = (hostCapabilities ?? []).filter((entry) => entry.startsWith("pack-ui:"));
  if (declared.length === 0) {
    return `declares views but no pack-ui version; add "pack-ui:${hostVersion}" to compatibility.hostCapabilities`;
  }
  if (declared.length > 1) return `declares pack-ui more than once (${declared.join(", ")})`;
  const match = PACK_UI_CAPABILITY.exec(declared[0]!);
  if (match === null) {
    return `"${declared[0]}" is not a pack-ui version; write "pack-ui:N" or "pack-ui:N-M"`;
  }
  const low = Number(match[1]);
  const high = match[2] === undefined ? low : Number(match[2]);
  if (hostVersion < low || hostVersion > high) {
    return `needs ${declared[0]}, but this host provides pack-ui:${hostVersion}`;
  }
  return null;
}

/** Bare modules a pack may import, and its stories may also import. */
const PACK_MODULES = /^(?:(?:react|effect)(?:$|\/)|@t3team\/pack-ui$)/;
const STORY_MODULES = /^(?:storybook|@storybook\/[^/]+)(?:$|\/)/;
/**
 * Imports the build itself adds to every module (React refresh, Vite's helpers, virtual modules).
 * They never come from pack source.
 */
const TOOLING = /^(?:\0|\/@react-refresh|\/@vite\/|vite\/)/;

const isWithin = (dir: string, path: string) => path === dir || path.startsWith(dir + NodePath.sep);

/**
 * Why `importer`, a file of the pack in `packDir`, may not import `source`, or `null`. `react`
 * and `effect` subpaths are allowed; `@t3team/pack-ui` subpaths are not (`/contract` is the
 * host's view of the package). Relative and absolute paths must stay inside the pack.
 */
export function packWebImportProblem(
  source: string,
  context: { readonly importer: string; readonly packDir: string },
): string | null {
  const specifier = source.split(/[?#]/)[0] ?? source;
  if (TOOLING.test(source)) return null;
  if (specifier === "~" || specifier.startsWith("~/") || specifier.startsWith("@/")) {
    return `"${source}" is a host app alias; a pack imports the host only through @t3team/pack-ui`;
  }
  if (specifier.startsWith(".") || NodePath.isAbsolute(specifier)) {
    const target = NodePath.resolve(NodePath.dirname(context.importer), specifier);
    return isWithin(NodePath.resolve(context.packDir), target)
      ? null
      : `"${source}" is outside the pack; a pack imports only its own files`;
  }
  if (PACK_MODULES.test(specifier)) return null;
  if (STORY_MODULES.test(specifier) && /\.stories\.[cm]?[jt]sx?$/.test(context.importer))
    return null;
  return `"${source}" is not available to packs; import react, effect, @t3team/pack-ui or the pack's own files`;
}
