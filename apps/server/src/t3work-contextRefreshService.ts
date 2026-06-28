import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerConfig } from "./config.ts";
import { runT3workContextRefreshForeground } from "./t3work-contextRefreshForegroundRun.ts";
import { runT3workContextRefreshSlice } from "./t3work-contextRefreshSliceRun.ts";
import { runT3workContextProjectRefreshForeground } from "./t3work-contextProjectRefreshRun.ts";
import {
  dedupRefreshWorkItem,
  type T3workContextRefreshSupersession,
} from "./t3work-contextRefreshServiceDedup.ts";
import {
  T3workContextRefreshError,
  type T3workContextProjectRefreshInput,
  type T3workContextProjectRefreshResult,
  type T3workContextRefreshInput,
  type T3workContextRefreshResult,
  type T3workContextRefreshSliceInput,
  type T3workContextRefreshSliceResult,
} from "./t3work-contextRefreshServiceTypes.ts";
import { resumeIncompleteT3workContextBackgroundJobs } from "./t3work-contextRefreshBackgroundResume.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

export {
  T3workContextRefreshError,
  type T3workContextRefreshInput,
  type T3workContextProjectRefreshInput,
  type T3workContextProjectRefreshResult,
  type T3workContextRefreshResult,
  type T3workContextRefreshSliceInput,
  type T3workContextRefreshSliceResult,
} from "./t3work-contextRefreshServiceTypes.ts";

export type T3workContextRefreshServiceShape = {
  readonly refreshWorkItem: (
    input: T3workContextRefreshInput,
  ) => Effect.Effect<T3workContextRefreshResult, T3workContextRefreshError>;
  readonly refreshWorkItemSlice: (
    input: T3workContextRefreshSliceInput,
  ) => Effect.Effect<T3workContextRefreshSliceResult, T3workContextRefreshError>;
  readonly refreshProject: (
    input: T3workContextProjectRefreshInput,
  ) => Effect.Effect<T3workContextProjectRefreshResult, T3workContextRefreshError>;
};

export class T3workContextRefreshService extends Context.Service<
  T3workContextRefreshService,
  T3workContextRefreshServiceShape
>()("t3/t3work-contextRefreshService/T3workContextRefreshService") {}

type T3workContextRefreshRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | ServerConfig
  | SqlClient.SqlClient
  | WorkspacePaths;

function toRefreshError(cause: unknown): T3workContextRefreshError {
  if (cause instanceof T3workContextRefreshError) {
    return cause;
  }
  return new T3workContextRefreshError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

export const NoopT3workContextRefreshService: T3workContextRefreshServiceShape = {
  refreshWorkItem: () =>
    Effect.fail(
      new T3workContextRefreshError({ message: "Context refresh service is unavailable." }),
    ),
  refreshWorkItemSlice: () =>
    Effect.fail(
      new T3workContextRefreshError({ message: "Context refresh service is unavailable." }),
    ),
  refreshProject: () =>
    Effect.fail(
      new T3workContextRefreshError({ message: "Context refresh service is unavailable." }),
    ),
};

const make = Effect.gen(function* () {
  const refreshContext = yield* Effect.context<T3workContextRefreshRequirements>();
  const active = new Map<
    string,
    Deferred.Deferred<T3workContextRefreshResult, T3workContextRefreshError>
  >();
  const supersessions = new Map<string, T3workContextRefreshSupersession>();
  const refreshWorkItem: T3workContextRefreshServiceShape["refreshWorkItem"] = (input) =>
    dedupRefreshWorkItem(active, supersessions, input, (supersession) =>
      runT3workContextRefreshForeground(input, supersession).pipe(
        Effect.provide(refreshContext),
        Effect.mapError(toRefreshError),
      ),
    );
  const refreshProject: T3workContextRefreshServiceShape["refreshProject"] = (input) =>
    runT3workContextProjectRefreshForeground(input).pipe(
      Effect.provide(refreshContext),
      Effect.mapError(toRefreshError),
    );
  const refreshWorkItemSlice: T3workContextRefreshServiceShape["refreshWorkItemSlice"] = (input) =>
    runT3workContextRefreshSlice(input).pipe(
      Effect.provide(refreshContext),
      Effect.mapError(toRefreshError),
    );
  yield* Effect.forkDetach(
    resumeIncompleteT3workContextBackgroundJobs().pipe(Effect.provide(refreshContext)),
  );
  return { refreshWorkItem, refreshWorkItemSlice, refreshProject };
});

export const T3workContextRefreshServiceLive = Layer.effect(T3workContextRefreshService, make);
