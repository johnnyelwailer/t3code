/**
 * Imports a recipe config that passed the data-only check, versioned so it and the files it
 * imports reload after an edit (t3team-projectRecipeModuleResolution.ts). The file is read again
 * after the import: if it changed in between, the import is not the text that was checked, so it
 * is discarded and the next read starts over.
 */
import * as NodeURL from "node:url";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  CONFIG_VERSION_PARAM,
  ensureProjectRecipeModuleResolution,
} from "./t3team-projectRecipeModuleResolution.ts";

type Layer = Readonly<Record<string, unknown>>;

export interface LoadedRecipeConfig {
  readonly defaults?: Layer;
  readonly scopes?: ReadonlyArray<Layer>;
}

export const importCheckedConfig = Effect.fn("importCheckedConfig")(function* (input: {
  readonly file: string;
  readonly version: string;
  readonly checkedSource: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  ensureProjectRecipeModuleResolution();
  const url = NodeURL.pathToFileURL(input.file);
  url.searchParams.set(CONFIG_VERSION_PARAM, input.version.replace(/[^0-9a-z-]/gi, "-"));
  const imported = yield* Effect.tryPromise(() => import(url.toString())).pipe(Effect.result);
  if (imported._tag === "Failure") {
    return { problem: `The config failed to load: ${String(imported.failure)}` } as const;
  }
  const after = yield* fileSystem.readFileString(input.file).pipe(Effect.orElseSucceed(() => ""));
  if (after !== input.checkedSource) {
    return { problem: "The config changed while it loaded; it is read again next time." } as const;
  }
  const config = (imported.success as { readonly default?: unknown }).default as
    | (LoadedRecipeConfig & { readonly kind?: string })
    | undefined;
  if (config?.kind !== "recipe-config") {
    return {
      problem: "The config's default export is not a defineRecipeConfig(...) result.",
    } as const;
  }
  return { config } as const;
});
