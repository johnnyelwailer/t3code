/**
 * The V2 single-writer primitives, handed out BY REFERENCE for fork layers.
 *
 * V2 serializes every write to a thread behind `ThreadCommandExecutor` (a
 * keyed, non-reentrant lock) and publishes committed events through the
 * in-memory PubSub inside `EventSinkV2`. A fork layer that builds its own
 * instance of either gets a lock that does not exclude the orchestrator and a
 * sink whose live subscribers never see its writes. Layers memoize by object
 * reference within one build, so fork layers must provide these exact exported
 * values — never a wrapper that rebuilds them, never `Layer.fresh` (critic C12).
 *
 * Rules for code that takes the lock:
 * - Never dispatch a command (OrchestratorV2 / ThreadManagementService) for a
 *   thread while holding that thread's lock: dispatch takes the same lock and
 *   deadlocks.
 * - Keep the locked section to read-current-state + `EventSinkV2.write`.
 */
import * as Layer from "effect/Layer";

import * as IdAllocator from "../orchestration-v2/IdAllocator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ThreadCommandExecutor from "../orchestration-v2/ThreadCommandExecutor.ts";
import * as TurnItemPositionStore from "../orchestration-v2/TurnItemPositionStore.ts";
import { layerEventSink } from "../orchestration-v2/runtimeLayer.ts";

/** The orchestrator's own thread lock (same reference `Orchestrator.layer` provides). */
const T3TeamThreadLockLayer = ThreadCommandExecutor.layer;

/** The runtime's shared event sink (same reference the V2 runtime layer provides). */
export const T3TeamEventSinkLayer = layerEventSink;

/**
 * Everything a fork writer needs to append V2 events under the thread lock:
 * the shared lock and sink plus the stateless id allocator, projection reads
 * and turn-item position store.
 */
export const T3TeamV2WriterLayerLive = Layer.mergeAll(
  T3TeamThreadLockLayer,
  T3TeamEventSinkLayer,
  IdAllocator.layer,
  ProjectionStore.layer,
  TurnItemPositionStore.layer,
);
