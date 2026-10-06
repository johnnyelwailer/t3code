/**
 * Provider-thread operations of a pack session runtime: ensure/resume/read/rollback/fork/
 * inject/unload, each a 1:1 JSON round-trip onto the pack's `PackSessionRuntime`.
 * Optional pack methods that are absent fail with the adapter's own error so the orchestrator
 * falls back exactly as it does for a built-in adapter (portable fork, no native rollback).
 *
 * @module t3team-pack-driverSessionThreads
 */
import type { PackSessionRuntime } from "@t3team/pack-api";
import type { ProviderDriverKind, ProviderSessionId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  ProviderAdapterEnsureThreadError,
  ProviderAdapterForkThreadError,
  ProviderAdapterProtocolError,
  ProviderAdapterReadThreadSnapshotError,
  ProviderAdapterResumeThreadError,
  ProviderAdapterRollbackThreadError,
  type ProviderAdapterV2SessionRuntime,
} from "./orchestration-v2/ProviderAdapter.ts";
import { packCall, packRoundTrip } from "./t3team-pack-driverCall.ts";
import { asPack, PackCodec } from "./t3team-pack-driverCodec.ts";

type ThreadOps = Pick<
  ProviderAdapterV2SessionRuntime,
  | "ensureThread"
  | "resumeThread"
  | "injectHistory"
  | "readThreadSnapshot"
  | "rollbackThread"
  | "forkThread"
  | "unloadThread"
>;

export const makePackThreadOps = (input: {
  readonly runtime: PackSessionRuntime;
  readonly driver: ProviderDriverKind;
  readonly providerSessionId: ProviderSessionId;
}): ThreadOps => {
  const { runtime, driver, providerSessionId } = input;
  const unsupported = (method: string) => new Error(`pack session has no ${method}`);
  const inject = runtime.injectHistory;
  const unload = runtime.unloadThread;
  return {
    ensureThread: (value) =>
      packRoundTrip(
        packCall(
          (cause) =>
            new ProviderAdapterEnsureThreadError({ driver, threadId: value.threadId, cause }),
        ),
        { codec: PackCodec.ensureThreadInput, value },
        (encoded) => runtime.ensureThread(asPack(encoded)),
        PackCodec.providerThread,
      ),
    resumeThread: (value) =>
      packRoundTrip(
        packCall(
          (cause) =>
            new ProviderAdapterResumeThreadError({
              driver,
              providerSessionId,
              providerThreadId: value.providerThread.id,
              cause,
            }),
        ),
        { codec: PackCodec.resumeThreadInput, value },
        (encoded) => runtime.resumeThread(asPack(encoded)),
        PackCodec.providerThread,
      ),
    ...(inject === undefined
      ? {}
      : {
          injectHistory: (value) => {
            const bridge = packCall(
              (cause) =>
                new ProviderAdapterProtocolError({ driver, detail: "injectHistory failed", cause }),
            );
            return bridge.encode(PackCodec.injectHistoryInput, value).pipe(
              Effect.flatMap((encoded) => bridge.call(() => inject.call(runtime, asPack(encoded)))),
              Effect.map((injected) => injected === true),
            );
          },
        }),
    readThreadSnapshot: (value) =>
      packRoundTrip(
        packCall(
          (cause) =>
            new ProviderAdapterReadThreadSnapshotError({
              driver,
              providerThreadId: value.providerThread.id,
              cause,
            }),
        ),
        { codec: PackCodec.threadRef, value },
        (encoded) => runtime.readThreadSnapshot(asPack(encoded)),
        PackCodec.threadSnapshot,
      ),
    rollbackThread: (value) =>
      packRoundTrip(
        packCall(
          (cause) =>
            new ProviderAdapterRollbackThreadError({
              driver,
              providerThreadId: value.providerThread.id,
              checkpointId: value.target.checkpointId,
              cause,
            }),
        ),
        { codec: PackCodec.rollbackInput, value },
        (encoded) =>
          runtime.rollbackThread === undefined
            ? Promise.reject(unsupported("rollbackThread"))
            : runtime.rollbackThread(asPack(encoded)),
        PackCodec.threadSnapshot,
      ),
    forkThread: (value) =>
      packRoundTrip(
        packCall(
          (cause) =>
            new ProviderAdapterForkThreadError({
              driver,
              providerThreadId: value.sourceProviderThread.id,
              cause,
            }),
        ),
        { codec: PackCodec.forkInput, value },
        (encoded) =>
          runtime.forkThread === undefined
            ? Promise.reject(unsupported("forkThread"))
            : runtime.forkThread(asPack(encoded)),
        PackCodec.providerThread,
      ),
    ...(unload === undefined
      ? {}
      : {
          unloadThread: (value) => {
            const bridge = packCall(
              (cause) =>
                new ProviderAdapterProtocolError({ driver, detail: "unloadThread failed", cause }),
            );
            return bridge
              .encode(PackCodec.threadRef, value)
              .pipe(
                Effect.flatMap((encoded) =>
                  bridge.call(() => unload.call(runtime, asPack(encoded))),
                ),
              );
          },
        }),
  };
};
