/**
 * Broker-side wiring for `t3work.widget.show`: captures the optional services the widget
 * pipeline needs (registry + CAS persistence) at layer-build time and produces the
 * per-thread `showWidget` dispatch callback. Kept out of `t3work-toolBrokerLive.ts` so the
 * broker layer stays small.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { OrchestrationCommand } from "@t3tools/contracts";

import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";
import type { T3workToolCallResult } from "./t3work-toolBroker.ts";
import { errorResult } from "./t3work-toolBrokerHelpers.ts";
import { T3workWidgetRegistry, type T3workWidgetRegistryShape } from "./t3work-widgetRegistry.ts";
import {
  callT3workWidgetShowTool,
  type T3workWidgetPersistenceServices,
} from "./t3work-widgetShowTool.ts";

export interface T3workWidgetShowRuntime {
  readonly registry: T3workWidgetRegistryShape | undefined;
  readonly persistenceContext: Context.Context<T3workWidgetPersistenceServices> | undefined;
}

/** Capture the widget pipeline's optional services from the ambient layer context. */
const captureT3workWidgetShowRuntime = Effect.fnUntraced(function* () {
  const registry = Option.getOrUndefined(yield* Effect.serviceOption(T3workWidgetRegistry));
  const fileSystem = Option.getOrUndefined(yield* Effect.serviceOption(FileSystem.FileSystem));
  const path = Option.getOrUndefined(yield* Effect.serviceOption(Path.Path));
  const sqlClient = Option.getOrUndefined(yield* Effect.serviceOption(SqlClient.SqlClient));
  const workspacePaths = Option.getOrUndefined(yield* Effect.serviceOption(WorkspacePaths));

  // The CAS artifact write needs all four services; persistence degrades to an inline-only
  // widget when any is missing in this runtime.
  const persistenceContext =
    fileSystem && path && sqlClient && workspacePaths
      ? Context.empty().pipe(
          Context.add(FileSystem.FileSystem, fileSystem),
          Context.add(Path.Path, path),
          Context.add(SqlClient.SqlClient, sqlClient),
          Context.add(WorkspacePaths, workspacePaths),
        )
      : undefined;

  return { registry, persistenceContext } satisfies T3workWidgetShowRuntime;
});

/** One-shot binder: capture the runtime once at layer build, then mint per-thread callbacks. */
export const makeT3workWidgetShowBinder = Effect.fnUntraced(function* () {
  const runtime = yield* captureT3workWidgetShowRuntime();
  return <TLoadError, TDispatchError>(
    input: Omit<Parameters<typeof makeT3workShowWidget<TLoadError, TDispatchError>>[0], "runtime">,
  ) => makeT3workShowWidget({ ...input, runtime });
});

export function makeT3workShowWidget<TLoadError, TDispatchError>(input: {
  readonly runtime: T3workWidgetShowRuntime;
  readonly threadId: string;
  /** Resolves the owning project (for the artifact workspace root); failures degrade to an
   * inline-only widget. */
  readonly loadThreadProject: () => Effect.Effect<
    { readonly project: { readonly workspaceRoot: string } },
    TLoadError
  >;
  readonly dispatch: (command: OrchestrationCommand) => Effect.Effect<unknown, TDispatchError>;
}): (toolArgs: unknown) => Effect.Effect<T3workToolCallResult> {
  return (toolArgs) =>
    Effect.gen(function* () {
      const registry = input.runtime.registry;
      if (!registry) {
        return errorResult("Widget rendering is not available in this runtime.");
      }
      const workspaceRoot = yield* input.loadThreadProject().pipe(
        Effect.map(({ project }) => project.workspaceRoot as string | undefined),
        Effect.option,
        Effect.map(Option.getOrUndefined),
      );
      return yield* callT3workWidgetShowTool({
        toolArgs,
        deps: {
          threadId: input.threadId,
          workspaceRoot,
          registry,
          dispatch: (command) =>
            input.dispatch(command).pipe(Effect.mapError((cause) => String(cause))),
          persistenceContext: input.runtime.persistenceContext,
        },
      });
    });
}
