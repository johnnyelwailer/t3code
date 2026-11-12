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
  /** The validated params the source instance is bound with (the project and its scope). */
  readonly params: unknown;
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

/** A claimed launch. `launchId` is durable (the ledger row) and is also the run id it launches. */
export interface RecipeTriggerLaunchRequest {
  readonly launchId: string;
  readonly projectId: string;
  readonly recipeId: string;
  readonly triggerId: string;
  readonly key: string;
  readonly args: Record<string, unknown>;
}

/** The durable launch history the limits are computed from (see the launch ledger store). */
export interface RecipeTriggerHistory {
  readonly inFlight: number;
  readonly launchesInWindow: number;
  readonly lastLaunchAtMsByKey: ReadonlyMap<string, number>;
}

/** One key's events on one signal instance, up to the newest slot the engine read. */
export interface RecipeTriggerSlice {
  readonly key: string;
  readonly instance: RecipeTriggerInstanceRef;
  readonly upToId: number;
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
  /** `select` faults (consumed) and `key` faults (left to the inbox cap); the runner goes on. */
  dropped: number;
}

/** The engine's injected ports (all deterministic in tests). */
export interface RecipeTriggerEnginePorts {
  readonly nowMs: () => number;
  readonly history: (input: {
    readonly recipeId: string;
    readonly triggerId: string;
    readonly windowStartMs: number;
    readonly intervalStartMs: number;
  }) => Promise<RecipeTriggerHistory>;
  /** Consume the slice and record the pending launch atomically; false when another consumer won. */
  readonly claim: (
    input: RecipeTriggerSlice & { readonly request: RecipeTriggerLaunchRequest },
  ) => Promise<boolean>;
  /** Consume the slice with no launch (a skipped or faulting event). */
  readonly consume: (slice: RecipeTriggerSlice) => Promise<void>;
  readonly newLaunchId: () => string;
  /** Start a claimed launch; the port records its outcome durably and never throws. */
  readonly launch: (request: RecipeTriggerLaunchRequest) => void;
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
