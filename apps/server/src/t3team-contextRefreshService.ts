import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerConfig } from "./config.ts";
import { runT3TeamContextRefreshForeground } from "./t3team-contextRefreshForegroundRun.ts";
import { runT3TeamContextRefreshSlice } from "./t3team-contextRefreshSliceRun.ts";
import { runT3TeamContextProjectRefreshForeground } from "./t3team-contextProjectRefreshRun.ts";
import {
  dedupRefreshWorkItem,
  type T3TeamContextRefreshSupersession,
} from "./t3team-contextRefreshServiceDedup.ts";
import {
  T3TeamContextRefreshError,
  type T3TeamContextProjectRefreshInput,
  type T3TeamContextProjectRefreshResult,
  type T3TeamContextRefreshInput,
  type T3TeamContextRefreshResult,
  type T3TeamContextRefreshSliceInput,
  type T3TeamContextRefreshSliceResult,
} from "./t3team-contextRefreshServiceTypes.ts";
import { resumeIncompleteT3TeamContextBackgroundJobs } from "./t3team-contextRefreshBackgroundResume.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

export {
  T3TeamContextRefreshError,
  type T3TeamContextRefreshInput,
  type T3TeamContextProjectRefreshInput,
  type T3TeamContextProjectRefreshResult,
  type T3TeamContextRefreshResult,
  type T3TeamContextRefreshSliceInput,
  type T3TeamContextRefreshSliceResult,
} from "./t3team-contextRefreshServiceTypes.ts";

export type T3TeamContextRefreshServiceShape = {
  readonly refreshWorkItem: (
    input: T3TeamContextRefreshInput,
  ) => Effect.Effect<T3TeamContextRefreshResult, T3TeamContextRefreshError>;
  readonly refreshWorkItemSlice: (
    input: T3TeamContextRefreshSliceInput,
  ) => Effect.Effect<T3TeamContextRefreshSliceResult, T3TeamContextRefreshError>;
  readonly refreshProject: (
    input: T3TeamContextProjectRefreshInput,
  ) => Effect.Effect<T3TeamContextProjectRefreshResult, T3TeamContextRefreshError>;
};

export class T3TeamContextRefreshService extends Context.Service<
  T3TeamContextRefreshService,
  T3TeamContextRefreshServiceShape
>()("t3/t3team-contextRefreshService/T3TeamContextRefreshService") {}

type T3TeamContextRefreshRequirements =
  | FileSystem.FileSystem
  | Path.Path
  | ServerConfig
  | SqlClient.SqlClient
  | WorkspacePaths;

function toRefreshError(cause: unknown): T3TeamContextRefreshError {
  if (cause instanceof T3TeamContextRefreshError) {
    return cause;
  }
  return new T3TeamContextRefreshError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

export const NoopT3TeamContextRefreshService: T3TeamContextRefreshServiceShape = {
  refreshWorkItem: () =>
    Effect.fail(
      new T3TeamContextRefreshError({ message: "Context refresh service is unavailable." }),
    ),
  refreshWorkItemSlice: () =>
    Effect.fail(
      new T3TeamContextRefreshError({ message: "Context refresh service is unavailable." }),
    ),
  refreshProject: () =>
    Effect.fail(
      new T3TeamContextRefreshError({ message: "Context refresh service is unavailable." }),
    ),
};

const make = Effect.gen(function* () {
  const refreshContext = yield* Effect.context<T3TeamContextRefreshRequirements>();
  const active = new Map<
    string,
    Deferred.Deferred<T3TeamContextRefreshResult, T3TeamContextRefreshError>
  >();
  const supersessions = new Map<string, T3TeamContextRefreshSupersession>();
  const refreshWorkItem: T3TeamContextRefreshServiceShape["refreshWorkItem"] = (input) =>
    dedupRefreshWorkItem(active, supersessions, input, (supersession) =>
      runT3TeamContextRefreshForeground(input, supersession).pipe(
        Effect.provide(refreshContext),
        Effect.mapError(toRefreshError),
      ),
    );
  const refreshProject: T3TeamContextRefreshServiceShape["refreshProject"] = (input) =>
    runT3TeamContextProjectRefreshForeground(input).pipe(
      Effect.provide(refreshContext),
      Effect.mapError(toRefreshError),
    );
  const refreshWorkItemSlice: T3TeamContextRefreshServiceShape["refreshWorkItemSlice"] = (input) =>
    runT3TeamContextRefreshSlice(input).pipe(
      Effect.provide(refreshContext),
      Effect.mapError(toRefreshError),
    );
  yield* Effect.forkDetach(
    resumeIncompleteT3TeamContextBackgroundJobs().pipe(Effect.provide(refreshContext)),
  );
  return { refreshWorkItem, refreshWorkItemSlice, refreshProject };
});

export const T3TeamContextRefreshServiceLive = Layer.effect(T3TeamContextRefreshService, make);
