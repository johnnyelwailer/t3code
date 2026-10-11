/**
 * The data shapes of the recipe-trigger launch policy (S5b) — the types the core engine
 * (t3team-recipeTriggerRunnerCore.ts) and the live runner layer share. Kept in their own
 * module so the engine file stays focused on the policy logic.
 */

import type { ModelSelection } from "@t3tools/contracts";
import type { RecipeTriggerSpec } from "@t3team/sdk";

import type { RecipeTriggerSetting } from "./t3team-recipeTriggerSettings.ts";

/** One enabled trigger the drain acts on, resolved during the last reconcile. */
export interface LiveTrigger {
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly action: string;
  readonly recipePath: string;
  readonly workflowPath: string;
  readonly instance: RecipeTriggerInstanceRef;
  readonly select: RecipeTriggerSpec["select"];
  readonly key: RecipeTriggerSpec["key"];
  readonly settings: RecipeTriggerEffectiveSettings & { readonly enabled: boolean };
  readonly storedSetting: RecipeTriggerSetting;
  readonly modelSelection: ModelSelection | null;
  readonly allowedToolGroups: ReadonlyArray<string> | undefined;
}

/** One undelivered inbox event the engine may act on. */
export interface RecipeTriggerPendingEvent {
  /** The durable inbox row id (ordering + the claim's join key). */
  readonly id: number;
  readonly payload: unknown;
  readonly createdAtMs: number;
}

/** A trigger's host-applied limits, after per-project overrides are merged in. */
export interface RecipeTriggerEffectiveSettings {
  readonly debounceMs: number;
  readonly minIntervalMs: number;
  readonly maxConcurrent: number;
  readonly dailyCap: number | null;
}

/** Defaults the spec fixes: one in flight, no debounce, no interval, no daily cap. */
export const RECIPE_TRIGGER_DEFAULT_SETTINGS: RecipeTriggerEffectiveSettings = {
  debounceMs: 0,
  minIntervalMs: 0,
  maxConcurrent: 1,
  dailyCap: null,
};

export interface RecipeTriggerLaunchRequest {
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly key: string;
  readonly args: Record<string, unknown>;
}

/** Which signal instance the engine's claim consumes from (the live layer's first-wins takes). */
export interface RecipeTriggerInstanceRef {
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly signalName: string;
}

export interface RecipeTriggerProcessResult {
  launched: number;
  /** Events processed with a `select` answer of `null` (consumed, no launch). */
  skipped: number;
  deferred: number;
  /** `key`/`select` faults: consumed and dropped, the runner goes on. */
  dropped: number;
}

/** The engine's injected ports (all deterministic in tests). */
export interface RecipeTriggerEnginePorts {
  readonly nowMs: () => number;
  /** Consume the key's pending events on one signal instance; `true` when at least one was taken. */
  readonly claim: (key: string, instance: RecipeTriggerInstanceRef) => Promise<boolean>;
  readonly launch: (request: RecipeTriggerLaunchRequest) => Promise<void>;
  readonly log?: (message: string, fields?: unknown) => void;
}

export interface RecipeTriggerProcessInput {
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly select: RecipeTriggerSpec["select"];
  readonly key: RecipeTriggerSpec["key"];
  readonly settings: RecipeTriggerEffectiveSettings;
  /** The host-side settings `select` may read (per-project overrides, host flags). */
  readonly selectContext: { readonly settings: Readonly<Record<string, unknown>> };
  /** The signal instance the key's events live in (the engine's claim consumes from it). */
  readonly instance: RecipeTriggerInstanceRef;
  readonly events: ReadonlyArray<RecipeTriggerPendingEvent>;
}
