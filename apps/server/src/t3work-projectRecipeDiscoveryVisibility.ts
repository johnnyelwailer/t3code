import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { pathToFileURL } from "node:url";
import {
  matchRecipes,
  type ProjectRecipeManifest,
  type ProjectRecipeRenderContext,
  type ProjectRecipeVisibilityResult,
} from "@t3tools/project-recipes";
import { getBundledT3WorkRecipe } from "@t3tools/t3work-skill-packs";

import {
  DEFAULT_VISIBILITY_TIMEOUT_MS,
  isRelativePath,
  resolveWithinRoot,
} from "./t3work-projectRecipeDiscoveryShared.ts";
import { evaluateExpression } from "./t3work-projectRecipeDiscoveryTemplate.ts";

function buildBundledCompatibilityResult(
  manifest: ProjectRecipeManifest,
  context: ProjectRecipeRenderContext,
): ProjectRecipeVisibilityResult | null {
  const bundledRecipe = getBundledT3WorkRecipe(manifest.id);
  if (!bundledRecipe) {
    return null;
  }
  const provider = context.project.provider;
  const linkedProviders = context.linkedResources
    .map((resource) => resource.provider)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const match = matchRecipes([bundledRecipe], {
    activeProject: provider ? { source: { provider } } : {},
    selectedResource: null,
    resourceKind: context.workitem?.kind ?? null,
    availableIntegrations: [...new Set([...(provider ? [provider] : []), ...linkedProviders])],
    surface: context.surface,
    ...(context.workitem?.type ? { jiraIssueType: context.workitem.type } : {}),
    enabledSkillPacks: context.enabledSkillPacks,
    profile: context.profile,
    availableContextKeys: context.availableContextKeys,
  })[0];

  return match ? { visible: true, rank: match.score, reason: match.reason } : { visible: false };
}

const evaluateVisibleModule = Effect.fn("evaluateVisibleModule")(function* (input: {
  readonly modulePath: string;
  readonly workspaceRoot: string;
  readonly recipePath: string;
  readonly context: ProjectRecipeRenderContext;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const runtimeContext = yield* Effect.context<FileSystem.FileSystem>();
  const runPromise = Effect.runPromiseWith(runtimeContext);
  const moduleUrl = pathToFileURL(input.modulePath);
  moduleUrl.searchParams.set("v", String(yield* Clock.currentTimeMillis));
  const imported = (yield* Effect.tryPromise(() => import(moduleUrl.toString()))) as {
    readonly visible?: (
      context: ProjectRecipeRenderContext,
      api: {
        readonly tools: {
          readonly call: (name: string, input?: Record<string, unknown>) => Promise<unknown>;
          readonly readResource: (uri: string) => Promise<unknown>;
        };
        readonly workspace: {
          readonly rootPath: string;
          readonly recipePath: string;
          readonly runPath?: string;
          readonly readText: (relativePath: string) => Promise<string>;
          readonly writeText: (relativePath: string, content: string) => Promise<void>;
          readonly exists: (relativePath: string) => Promise<boolean>;
        };
        readonly log: {
          readonly info: (message: string, fields?: Record<string, unknown>) => void;
          readonly warn: (message: string, fields?: Record<string, unknown>) => void;
          readonly error: (message: string, fields?: Record<string, unknown>) => void;
        };
        readonly fetch: typeof fetch;
      },
    ) => Promise<boolean | ProjectRecipeVisibilityResult> | boolean | ProjectRecipeVisibilityResult;
  };

  if (typeof imported.visible !== "function") {
    throw new Error("visible.ts must export a visible function.");
  }
  const visible = imported.visible;

  return yield* Effect.promise(() =>
    Promise.resolve(
      visible(input.context, {
        tools: {
          call: async (name) => {
            throw new Error(`Recipe tool '${name}' is not available during visibility evaluation.`);
          },
          readResource: async (uri) => {
            throw new Error(
              `Recipe resource '${uri}' is not available during visibility evaluation.`,
            );
          },
        },
        workspace: {
          rootPath: input.workspaceRoot,
          recipePath: input.recipePath,
          readText: async (relativePath) =>
            runPromise(
              fileSystem.readFileString(
                resolveWithinRoot(pathService, input.workspaceRoot, relativePath),
              ),
            ),
          writeText: async (relativePath, content) => {
            const targetPath = resolveWithinRoot(pathService, input.workspaceRoot, relativePath);
            await runPromise(
              fileSystem
                .makeDirectory(pathService.dirname(targetPath), { recursive: true })
                .pipe(Effect.andThen(fileSystem.writeFileString(targetPath, content))),
            );
          },
          exists: async (relativePath) =>
            runPromise(
              fileSystem
                .exists(resolveWithinRoot(pathService, input.workspaceRoot, relativePath))
                .pipe(Effect.orElseSucceed(() => false)),
            ),
        },
        log: { info: () => undefined, warn: () => undefined, error: () => undefined },
        fetch,
      }),
    ),
  );
});

export const evaluateVisibility = Effect.fn("evaluateVisibility")(function* (input: {
  readonly manifest: ProjectRecipeManifest;
  readonly workspaceRoot: string;
  readonly recipePath: string;
  readonly context: ProjectRecipeRenderContext;
}) {
  const pathService = yield* Path.Path;
  const visibleWhen = input.manifest.visibleWhen;
  if (!visibleWhen) {
    return buildBundledCompatibilityResult(input.manifest, input.context) ?? { visible: true };
  }
  if (typeof visibleWhen === "object" && visibleWhen.kind === "expr") {
    const evaluated = Boolean(evaluateExpression(visibleWhen.expr, input.context));
    return {
      visible: evaluated,
      ...(typeof input.manifest.rank === "number" ? { rank: input.manifest.rank } : {}),
    };
  }
  if (typeof visibleWhen === "string" && isRelativePath(visibleWhen)) {
    const modulePath = resolveWithinRoot(pathService, input.recipePath, visibleWhen);
    const result = yield* evaluateVisibleModule({
      modulePath,
      workspaceRoot: input.workspaceRoot,
      recipePath: input.recipePath,
      context: input.context,
    }).pipe(Effect.timeoutOption(`${DEFAULT_VISIBILITY_TIMEOUT_MS} millis`));
    if (Option.isNone(result)) {
      return { visible: false };
    }
    return typeof result.value === "boolean" ? { visible: result.value } : result.value;
  }
  return buildBundledCompatibilityResult(input.manifest, input.context) ?? { visible: true };
});
