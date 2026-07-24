/**
 * Broker-side wiring for `t3team.widget.show`: captures the optional services the widget
 * pipeline needs (registry + CAS persistence) at layer-build time and produces the
 * per-thread `showWidget` dispatch callback. Kept out of `t3team-toolBrokerLive.ts` so the
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
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import { T3TeamWidgetRegistry, type T3TeamWidgetRegistryShape } from "./t3team-widgetRegistry.ts";
import {
  callT3TeamWidgetShowTool,
  type T3TeamWidgetPersistenceServices,
} from "./t3team-widgetShowTool.ts";

export interface T3TeamWidgetShowRuntime {
  readonly registry: T3TeamWidgetRegistryShape | undefined;
  readonly persistenceContext: Context.Context<T3TeamWidgetPersistenceServices> | undefined;
}

/** Capture the widget pipeline's optional services from the ambient layer context. */
const captureT3TeamWidgetShowRuntime = Effect.fnUntraced(function* () {
  const registry = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWidgetRegistry));
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

  return { registry, persistenceContext } satisfies T3TeamWidgetShowRuntime;
});

/** One-shot binder: capture the runtime once at layer build, then mint per-thread callbacks. */
export const makeT3TeamWidgetShowBinder = Effect.fnUntraced(function* () {
  const runtime = yield* captureT3TeamWidgetShowRuntime();
  return <TLoadError, TDispatchError>(
    input: Omit<Parameters<typeof makeT3TeamShowWidget<TLoadError, TDispatchError>>[0], "runtime">,
  ) => makeT3TeamShowWidget({ ...input, runtime });
});

export function makeT3TeamShowWidget<TLoadError, TDispatchError>(input: {
  readonly runtime: T3TeamWidgetShowRuntime;
  readonly threadId: string;
  /** Resolves the owning project (for the artifact workspace root); failures degrade to an
   * inline-only widget. */
  readonly loadThreadProject: () => Effect.Effect<
    { readonly project: { readonly workspaceRoot: string } },
    TLoadError
  >;
  readonly dispatch: (command: OrchestrationCommand) => Effect.Effect<unknown, TDispatchError>;
}): (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult> {
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
      return yield* callT3TeamWidgetShowTool({
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
