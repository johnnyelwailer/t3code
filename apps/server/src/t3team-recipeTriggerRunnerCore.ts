/**
 * The recipe-trigger launch policy (S5b) as a plain, clock-injected engine — the unit the
 * fake-clock tests drive: a burst for one key collapses into ONE launch (trailing debounce,
 * newest payload wins), `minIntervalMs` holds a key after a launch, `maxConcurrent` and
 * `dailyCap` defer, and a throwing `select` drops its event without stopping the runner.
 * The engine DECIDES per key and then CLAIMS (claiming durably consumes the key's pending
 * inbox events; an unclaimed key is not launched, deferred keys are re-derived next poll).
 * All limits are enforced HERE, host-side: a buggy pack `select`/`key` cannot exceed them.
 */

import type { RecipeTriggerSpec } from "@t3team/sdk";
import type { ModelSelection } from "@t3tools/contracts";
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

const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

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

export function makeRecipeTriggerEngine(ports: RecipeTriggerEnginePorts) {
  const log = ports.log ?? (() => {});
  const inFlightByRecipe = new Map<string, number>();
  const launchTimesByRecipe = new Map<string, number[]>();
  const lastLaunchAtByKey = new Map<string, number>();

  const keyStateId = (recipeId: string, triggerId: string, key: string) =>
    `${recipeId}:${triggerId}:${key}`;

  const launchesInWindow = (recipeId: string, now: number): number =>
    (launchTimesByRecipe.get(recipeId) ?? []).filter((time) => now - time < DAILY_WINDOW_MS).length;

  const processEvents = async (
    input: RecipeTriggerProcessInput,
  ): Promise<RecipeTriggerProcessResult> => {
    const now = ports.nowMs();
    const result: RecipeTriggerProcessResult = { launched: 0, skipped: 0, deferred: 0, dropped: 0 };

    // Group by the trigger's key; a key() fault quarantines only that event.
    const eventsByKey = new Map<string, RecipeTriggerPendingEvent[]>();
    for (const event of input.events) {
      let key: string;
      try {
        key = input.key(event.payload);
      } catch (error) {
        log("trigger key() failed; deferring the event to the source's undelivered cap", {
          recipe: input.recipeId,
          trigger: input.triggerId,
          error: String(error),
        });
        result.dropped += 1;
        continue;
      }
      const bucket = eventsByKey.get(key);
      if (bucket === undefined) eventsByKey.set(key, [event]);
      else bucket.push(event);
    }

    // Oldest event first: a key that has been waiting longest launches first.
    const keys = [...eventsByKey.entries()]
      .toSorted((a, b) => Math.min(...a[1].map((e) => e.id)) - Math.min(...b[1].map((e) => e.id)))
      .map(([key]) => key);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const events = eventsByKey.get(key)!;
      const newest = events.reduce((max, e) => Math.max(max, e.createdAtMs), 0);
      if (now - newest < input.settings.debounceMs) {
        result.deferred += 1;
        continue;
      }
      const lastAt = lastLaunchAtByKey.get(keyStateId(input.recipeId, input.triggerId, key));
      if (lastAt !== undefined && now - lastAt < input.settings.minIntervalMs) {
        result.deferred += 1;
        continue;
      }
      const inFlight = inFlightByRecipe.get(input.recipeId) ?? 0;
      const capped =
        inFlight >= input.settings.maxConcurrent ||
        (input.settings.dailyCap !== null &&
          launchesInWindow(input.recipeId, now) >= input.settings.dailyCap);
      if (capped) {
        // This trigger's remaining keys wait too: the caps are per recipe.
        result.deferred += keys.length - i;
        break;
      }

      const payload = events[events.length - 1]!.payload;
      let args: Record<string, unknown> | null;
      try {
        args = input.select(payload, input.selectContext);
      } catch (error) {
        log("trigger select() failed; dropping the events, runner continues", {
          recipe: input.recipeId,
          trigger: input.triggerId,
          key,
          error: String(error),
        });
        await ports.claim(key, input.instance);
        result.dropped += events.length;
        continue;
      }
      if (args === null) {
        await ports.claim(key, input.instance);
        result.skipped += events.length;
        continue;
      }
      const claimed = await ports.claim(key, input.instance);
      if (!claimed) continue; // another consumer took the events between list and claim
      lastLaunchAtByKey.set(keyStateId(input.recipeId, input.triggerId, key), now);
      inFlightByRecipe.set(input.recipeId, inFlight + 1);
      const times = launchTimesByRecipe.get(input.recipeId) ?? [];
      launchTimesByRecipe.set(input.recipeId, [...times, now]);
      result.launched += 1;
      const request: RecipeTriggerLaunchRequest = {
        projectId: input.projectId,
        recipeId: input.recipeId,
        triggerId: input.triggerId,
        key,
        args,
      };
      void ports
        .launch(request)
        .catch((error) =>
          log("trigger launch failed", {
            recipe: input.recipeId,
            trigger: input.triggerId,
            key,
            error: String(error),
          }),
        )
        .finally(() => {
          inFlightByRecipe.set(input.recipeId, (inFlightByRecipe.get(input.recipeId) ?? 1) - 1);
        });
    }
    return result;
  };

  return {
    processEvents,
    /** Test/observation hook: in-flight launches of one recipe right now. */
    inFlight: (recipeId: string) => inFlightByRecipe.get(recipeId) ?? 0,
  };
}

export type RecipeTriggerEngine = ReturnType<typeof makeRecipeTriggerEngine>;
