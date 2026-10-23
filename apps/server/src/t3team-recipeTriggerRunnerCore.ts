/**
 * The recipe-trigger launch policy (S5b) as a plain, clock-injected engine — the unit the
 * fake-clock tests drive: a burst for one key collapses into ONE launch (trailing debounce,
 * newest payload wins), `minIntervalMs` holds a key after a launch, `maxConcurrent` and
 * `dailyCap` defer, and a throwing `select` drops its event without stopping the runner.
 *
 * The engine keeps no state of its own. The limits are read from the durable launch history
 * before each pass, and a launch is CLAIMED durably — the key's inbox slots are consumed and a
 * pending launch recorded in one transaction — before it starts, so neither a restart nor a
 * failed launch loses an event or resets a limit. All limits are enforced HERE, host-side: a buggy
 * pack `select`/`key` cannot exceed them.
 */

import type {
  RecipeTriggerEnginePorts,
  RecipeTriggerPendingEvent,
  RecipeTriggerProcessInput,
  RecipeTriggerProcessResult,
} from "./t3team-recipeTriggerRunnerCoreTypes.ts";

export { RECIPE_TRIGGER_DEFAULT_SETTINGS } from "./t3team-recipeTriggerRunnerCoreTypes.ts";
export type {
  LiveTrigger,
  RecipeTriggerEffectiveSettings,
  RecipeTriggerEnginePorts,
  RecipeTriggerHistory,
  RecipeTriggerInstanceRef,
  RecipeTriggerLaunchRequest,
  RecipeTriggerSlice,
} from "./t3team-recipeTriggerRunnerCoreTypes.ts";

const RECIPE_TRIGGER_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

function groupByKey(
  input: RecipeTriggerProcessInput,
  log: (message: string, fields?: unknown) => void,
): { readonly byKey: Map<string, RecipeTriggerPendingEvent[]>; readonly faulted: number } {
  const byKey = new Map<string, RecipeTriggerPendingEvent[]>();
  let faulted = 0;
  for (const event of input.events) {
    let key: string;
    try {
      key = input.key(event.payload);
    } catch (error) {
      log("trigger key() failed; leaving the event to the source's undelivered cap", {
        recipe: input.recipeId,
        trigger: input.triggerId,
        error: String(error),
      });
      faulted += 1;
      continue;
    }
    const bucket = byKey.get(key);
    if (bucket === undefined) byKey.set(key, [event]);
    else bucket.push(event);
  }
  return { byKey, faulted };
}

export function makeRecipeTriggerEngine(ports: RecipeTriggerEnginePorts) {
  const log = ports.log ?? (() => {});

  const processEvents = async (
    input: RecipeTriggerProcessInput,
  ): Promise<RecipeTriggerProcessResult> => {
    const now = ports.nowMs();
    const { byKey, faulted } = groupByKey(input, log);
    const result: RecipeTriggerProcessResult = {
      launched: 0,
      skipped: 0,
      deferred: 0,
      dropped: faulted,
    };
    if (byKey.size === 0) return result;
    const history = await ports.history({
      recipeId: input.recipeId,
      triggerId: input.triggerId,
      windowStartMs: now - RECIPE_TRIGGER_DAILY_WINDOW_MS,
      intervalStartMs: now - input.settings.minIntervalMs,
    });
    let inFlight = history.inFlight;
    let launchesInWindow = history.launchesInWindow;

    // Oldest event first: a key that has been waiting longest launches first.
    const keys = [...byKey.entries()]
      .toSorted((a, b) => Math.min(...a[1].map((e) => e.id)) - Math.min(...b[1].map((e) => e.id)))
      .map(([key]) => key);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const events = byKey.get(key)!;
      const newest = events.reduce((max, e) => Math.max(max, e.createdAtMs), 0);
      if (now - newest < input.settings.debounceMs) {
        result.deferred += 1;
        continue;
      }
      const lastAt = history.lastLaunchAtMsByKey.get(key);
      if (lastAt !== undefined && now - lastAt < input.settings.minIntervalMs) {
        result.deferred += 1;
        continue;
      }
      const capped =
        inFlight >= input.settings.maxConcurrent ||
        (input.settings.dailyCap !== null && launchesInWindow >= input.settings.dailyCap);
      if (capped) {
        // This trigger's remaining keys wait too: the caps are per recipe.
        result.deferred += keys.length - i;
        break;
      }

      const slice = {
        key,
        instance: input.instance,
        upToId: events.reduce((max, e) => Math.max(max, e.id), 0),
      };
      let args: Record<string, unknown> | null;
      try {
        args = input.select(events[events.length - 1]!.payload, input.selectContext);
      } catch (error) {
        log("trigger select() failed; dropping the events, runner continues", {
          recipe: input.recipeId,
          trigger: input.triggerId,
          key,
          error: String(error),
        });
        await ports.consume(slice);
        result.dropped += events.length;
        continue;
      }
      if (args === null) {
        await ports.consume(slice);
        result.skipped += events.length;
        continue;
      }
      const request = {
        launchId: ports.newLaunchId(),
        projectId: input.projectId,
        recipeId: input.recipeId,
        triggerId: input.triggerId,
        key,
        args,
      };
      if (!(await ports.claim({ ...slice, request }))) continue; // another consumer took them
      inFlight += 1;
      launchesInWindow += 1;
      result.launched += 1;
      ports.launch(request);
    }
    return result;
  };

  return { processEvents };
}

export type RecipeTriggerEngine = ReturnType<typeof makeRecipeTriggerEngine>;
