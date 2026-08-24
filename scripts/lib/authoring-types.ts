/**
 * Staging of the authoring-type closure into the desktop build's staged
 * node_modules.
 *
 * The packaged typechecker resolves authoring types from the asar's
 * node_modules; this module curates the real-file copies that end up there
 * (and fails the build when the curation is incomplete). Consumed by
 * scripts/build-desktop-artifact.ts (mac/linux app.asar + the Windows server
 * sidecar) and asserted against by scripts/check-orchestration-bundle.ts.
 */

import * as NodeModule from "node:module";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

// JSON.parse/JSON.stringify are forbidden by effect(preferSchemaOverJson);
// these decode/encode an unknown value through a JSON string exactly like the
// globals would, without widening the diagnostic surface.
const parseJsonUnknown = Schema.decodeSync(Schema.fromJsonString(Schema.Unknown));
const stringifyJsonPretty = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown, { space: 2 }));

export class AuthoringTypesStagingError extends Schema.TaggedErrorClass<AuthoringTypesStagingError>()(
  "AuthoringTypesStagingError",
  { missingPath: Schema.String },
) {
  override get message(): string {
    return `The staged authoring types are incomplete: ${this.missingPath} is missing. The packaged typechecker would degrade to "typecheck-unavailable" for every workflow, and that degradation is silent at runtime. Check the stageAuthoringTypes curation in scripts/lib/authoring-types.ts.`;
  }
}

// The authoring-type closure the packaged typechecker must resolve from the
// staged node_modules: the SDK source package, its @runbook/* source
// dependencies, and the TypeScript compiler. Without them the packaged
// `recipe validate` / orchestration typecheck degrades to
// "typecheck-unavailable" for every workflow — the types widen to `any` and
// the checker refuses to run rather than report a false pass.
//
// They are staged as CURATED real files (package.json + src/ only), not the
// pnpm workspace symlinks the staged install creates: the asar pack steps do
// not reliably dereference symlinks, and the curated copies keep the asar
// small. Resolution of the copies' own imports walks up to this same
// node_modules tree, where effect and typescript also live, so no per-package
// node_modules is needed.
export const AUTHORING_TYPE_PACKAGES = [
  { name: "@t3team/sdk", packageDir: "t3team-sdk" },
  { name: "@runbook/core", packageDir: "runbook-core" },
  { name: "@runbook/ts", packageDir: "runbook-ts" },
  { name: "@runbook/threads", packageDir: "runbook-threads" },
  { name: "@runbook/tools", packageDir: "runbook-tools" },
  { name: "@runbook/scripts", packageDir: "runbook-scripts" },
] as const;

/**
 * Plain version specs for the authoring-type packages, for the staged
 * package.json. Plain (not `workspace:*`) because electron-builder reads that
 * manifest and does not understand the pnpm workspace protocol; the staged
 * pnpm-workspace.yaml sets `linkWorkspacePackages` so pnpm still resolves the
 * plain specs to the copied packages/ tree instead of the registry (the
 * packages are unpublished, so a registry fetch would 404).
 */
export const readAuthoringTypeDependencySpecs = Effect.fn(
  "desktopArtifact.readAuthoringTypeDependencySpecs",
)(function* (input: {
  readonly repoRoot: string;
  readonly workspaceCatalog: Record<string, string>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const specs: Record<string, string> = {};
  for (const { name, packageDir } of AUTHORING_TYPE_PACKAGES) {
    const manifestRaw = yield* fs.readFileString(
      path.join(input.repoRoot, "packages", packageDir, "package.json"),
    );
    specs[name] = (parseJsonUnknown(manifestRaw) as { readonly version: string }).version;
  }
  // The compiler ships as a trimmed copy (see stageAuthoringTypes); declare it
  // with the catalog range so the manifest stays honest about what is staged.
  specs["typescript"] = input.workspaceCatalog["typescript"] ?? "*";
  return specs;
});

// Replace the staged install's authoring-type entries with curated real-file
// copies and fail the build if the curation is incomplete.
export const stageAuthoringTypes = Effect.fn("desktopArtifact.stageAuthoringTypes")(
  function* (input: {
    readonly repoRoot: string;
    readonly nodeModulesDir: string;
    readonly workspaceCatalog: Record<string, string>;
    readonly includeTypeScript: boolean;
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const specs = yield* readAuthoringTypeDependencySpecs({
      repoRoot: input.repoRoot,
      workspaceCatalog: input.workspaceCatalog,
    });

    const rewriteSpec = (name: string, spec: unknown): string => {
      if (spec === "workspace:*") return specs[name] ?? "0.0.0";
      if (spec === "catalog:") return input.workspaceCatalog[name] ?? "*";
      return typeof spec === "string" ? spec : String(spec);
    };

    for (const { name, packageDir } of AUTHORING_TYPE_PACKAGES) {
      const sourceDir = path.join(input.repoRoot, "packages", packageDir);
      const targetDir = path.join(input.nodeModulesDir, ...name.split("/"));
      // Remove whatever the staged install put here (a pnpm workspace symlink)
      // and write the curated copy: the manifest with plain dependency specs
      // (electron-builder reads it for the asar pruning closure) plus src/.
      yield* fs.remove(targetDir).pipe(Effect.orElseSucceed(() => undefined));
      yield* fs.makeDirectory(targetDir, { recursive: true });
      const manifest = parseJsonUnknown(
        yield* fs.readFileString(path.join(sourceDir, "package.json")),
      ) as { readonly dependencies?: Record<string, unknown>; [key: string]: unknown };
      const curated = {
        ...manifest,
        dependencies: manifest.dependencies
          ? Object.fromEntries(
              Object.entries(manifest.dependencies).map(([dep, spec]) => [
                dep,
                rewriteSpec(dep, spec),
              ]),
            )
          : manifest.dependencies,
      };
      yield* fs.writeFileString(
        path.join(targetDir, "package.json"),
        `${stringifyJsonPretty(curated)}\n`,
      );
      yield* fs.copy(path.join(sourceDir, "src"), path.join(targetDir, "src"));
    }

    if (input.includeTypeScript) {
      // The compiler: only what the packaged typechecker needs — the API typings
      // (lib/typescript.d.ts, for `import type * as TsApi from "typescript"`)
      // and the JS entry (lib/typescript.js), which keeps the createRequire
      // fallback in packages/runbook-ts/src/typescript.ts loadable from the
      // asar. The lib/*.d.ts type libraries are NOT copied here: the inlined
      // compiler (the primary path) finds them beside the emitted chunks
      // (apps/server's t3team-typescriptLibPackPlugin ships dist/lib/).
      const typescriptEntry = NodeModule.createRequire(
        path.join(input.repoRoot, "packages", "runbook-ts", "package.json"),
      ).resolve("typescript");
      const typescriptLibDir = path.dirname(typescriptEntry);
      const targetDir = path.join(input.nodeModulesDir, "typescript");
      yield* fs.remove(targetDir).pipe(Effect.orElseSucceed(() => undefined));
      yield* fs.makeDirectory(path.join(targetDir, "lib"), { recursive: true });
      yield* fs.copyFile(
        path.join(path.dirname(typescriptLibDir), "package.json"),
        path.join(targetDir, "package.json"),
      );
      yield* fs.copyFile(
        path.join(typescriptLibDir, "typescript.js"),
        path.join(targetDir, "lib", "typescript.js"),
      );
      yield* fs.copyFile(
        path.join(typescriptLibDir, "typescript.d.ts"),
        path.join(targetDir, "lib", "typescript.d.ts"),
      );
    }

    // Fail the build on an incomplete curation: at runtime the missing piece
    // shows up only as a "typecheck-unavailable" finding on every workflow.
    const requiredFiles = [
      ...AUTHORING_TYPE_PACKAGES.map(({ name }) =>
        path.join(input.nodeModulesDir, ...name.split("/"), "package.json"),
      ),
      path.join(input.nodeModulesDir, "@t3team", "sdk", "src", "t3team-sdk.index.ts"),
      ...(input.includeTypeScript
        ? [
            path.join(input.nodeModulesDir, "typescript", "lib", "typescript.js"),
            path.join(input.nodeModulesDir, "typescript", "lib", "typescript.d.ts"),
          ]
        : []),
    ];
    for (const file of requiredFiles) {
      if (!(yield* fs.exists(file))) {
        return yield* new AuthoringTypesStagingError({ missingPath: file });
      }
    }

    yield* Effect.log(
      `[desktop-artifact] Staged authoring types (${AUTHORING_TYPE_PACKAGES.map((p) => p.name).join(", ")}${input.includeTypeScript ? ", typescript" : ""}).`,
    );
  },
);
