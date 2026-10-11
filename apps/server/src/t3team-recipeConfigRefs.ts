/**
 * Turns a loaded config's values into data a run can journal (G12, G11's references):
 *
 *   • a `defineWorkflow` ref → `{ kind: "workflow", absolutePath }`, which must lie under the
 *     project's state dir (a ref resolves against the config file, never the recipe dir);
 *   • `recipeAction(id, action?)` → the action resolved through pack → project precedence,
 *     `{ kind: "recipe-action", recipeId, action, workflowPath, recipePath, source }`;
 *   • an imported `defineScript` module → `{ kind: "script", modulePath, export }`.
 *
 * A reference that does not resolve is dropped with a warning naming file, key and line, so the
 * key keeps its next lower layer (in the end the recipe's own default).
 */
import type { RecipeConfigWarning } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveRecipeActionById } from "./t3team-recipeRunById.ts";

export interface ConfigRefContext {
  readonly workspaceRoot: string;
  /** `<workspace>/<state dir>`; every referenced file must lie below it. */
  readonly stateRoot: string;
  readonly file: string;
  readonly keyLines: Readonly<Record<string, number>>;
  readonly keyRefs: Readonly<Record<string, string>>;
  readonly imports: Readonly<Record<string, { readonly specifier: string; readonly name: string }>>;
}

const DROP = Symbol("drop");

export const normalizeConfigLayer = Effect.fn("normalizeConfigLayer")(function* (
  context: ConfigRefContext,
  layer: Readonly<Record<string, unknown>>,
  path: string,
  warnings: RecipeConfigWarning[],
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const warn = (keyPath: string, message: string) => {
    const line = context.keyLines[keyPath];
    warnings.push({
      key: keyPath.slice(keyPath.indexOf(".") + 1),
      message: `${message}; using the value below it.`,
      file: context.file,
      ...(line === undefined ? {} : { line }),
    });
  };
  const inside = (file: string) => {
    const relative = pathService.relative(context.stateRoot, file);
    return relative.length > 0 && !relative.startsWith("..") && !pathService.isAbsolute(relative);
  };
  const exists = (file: string) => fileSystem.exists(file).pipe(Effect.orElseSucceed(() => false));

  const normalize = (
    value: unknown,
    keyPath: string,
    topLevel: boolean,
  ): Effect.Effect<unknown, never, FileSystem.FileSystem | Path.Path> =>
    Effect.gen(function* () {
      const kind = (value as { readonly kind?: unknown } | null)?.kind;
      if (kind === "workflow") {
        const absolutePath = String((value as { absolutePath?: unknown }).absolutePath ?? "");
        if (!inside(absolutePath) || !(yield* exists(absolutePath))) {
          warn(keyPath, `workflow ${absolutePath} is not a file under ${context.stateRoot}`);
          return DROP;
        }
        return { kind: "workflow", absolutePath };
      }
      if (kind === "recipe-action") {
        const ref = value as { recipeId: string; action?: string };
        const resolved = yield* resolveRecipeActionById({
          workspaceRoot: context.workspaceRoot,
          recipeId: ref.recipeId,
          action: ref.action,
        }).pipe(Effect.result);
        if (resolved._tag === "Failure") {
          warn(keyPath, String(resolved.failure));
          return DROP;
        }
        const { id, action, workflowPath, recipePath, source } = resolved.success;
        return { kind: "recipe-action", recipeId: id, action, workflowPath, recipePath, source };
      }
      if (kind === "script") {
        const local = topLevel ? context.keyRefs[keyPath] : undefined;
        const imported = local === undefined ? undefined : context.imports[local];
        const modulePath =
          imported === undefined
            ? undefined
            : pathService.resolve(pathService.dirname(context.file), imported.specifier);
        if (modulePath === undefined || !inside(modulePath)) {
          warn(
            keyPath,
            "a script reference must be a top-level key importing a file under the state dir",
          );
          return DROP;
        }
        return { kind: "script", modulePath, export: imported!.name };
      }
      if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
        warn(keyPath, `${typeof value} is not data`);
        return DROP;
      }
      if (Array.isArray(value)) {
        const items: unknown[] = [];
        for (const item of value) {
          const normalized = yield* normalize(item, keyPath, false);
          if (normalized !== DROP) items.push(normalized);
        }
        return items;
      }
      if (typeof value === "object" && value !== null) {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
          const normalized = yield* normalize(item, `${keyPath}.${key}`, false);
          if (normalized !== DROP) out[key] = normalized;
        }
        return out;
      }
      return value;
    });

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(layer)) {
    const normalized = yield* normalize(value, `${path}.${key}`, true);
    if (normalized !== DROP) out[key] = normalized;
  }
  return out;
});
