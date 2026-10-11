/**
 * `defineRecipe({ triggers })` validation (S5b) — the recipe-module half of the trigger surface.
 *
 * A trigger is a host-side, event-driven launch of one of the recipe's actions: one event
 * becomes one headless run. The host owns every launch limit (debounce, `minIntervalMs`,
 * `maxConcurrent`, `dailyCap`), so this validation is about IDENTITY only: unique trigger ids,
 * a built-in source the engine can start, a signal that source actually emits, and numeric
 * limits that mean what they say. It never inspects `select`/`key` behavior — they run
 * host-side as trusted pack code.
 */

import { declaresSignal } from "./t3team-sdk.signal.ts";
import type { RecipeTriggerSpec } from "./t3team-sdk.recipeTypes.ts";

/** Action names are wire identifiers, same rule as `actions` map keys. */
const TRIGGER_ACTION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** `default` is how the wire spells "no action name given" — a trigger must name a real one. */
const DEFAULT_ACTION_NAME = "default";

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function assertRecipeTriggers(
  recipeId: string,
  triggers: ReadonlyArray<RecipeTriggerSpec>,
): void {
  const where = `Recipe '${recipeId}'`;
  const seenIds = new Set<string>();
  for (const trigger of triggers) {
    if (typeof trigger.id !== "string" || trigger.id.trim().length === 0) {
      throw new Error(`${where}: every trigger needs a non-empty id.`);
    }
    if (seenIds.has(trigger.id)) {
      throw new Error(
        `${where}: trigger ids must be unique within the recipe (duplicate '${trigger.id}').`,
      );
    }
    seenIds.add(trigger.id);

    const source = trigger.source;
    if (source?.kind !== "signalSource" || source.builtin !== true) {
      throw new Error(
        `${where}: trigger '${trigger.id}' must listen to a built-in signal source (builtinSignalSource(...) result) — host-owned lifecycle only.`,
      );
    }
    if (trigger.signal?.kind !== "signal") {
      throw new Error(`${where}: trigger '${trigger.id}' needs a defineSignal(...) signal.`);
    }
    if (!declaresSignal(source, trigger.signal)) {
      throw new Error(
        `${where}: trigger '${trigger.id}' listens to signal '${trigger.signal.name}', but source '${source.name}' does not emit it.`,
      );
    }
    if (typeof trigger.select !== "function") {
      throw new Error(`${where}: trigger '${trigger.id}' needs a select(payload, ctx) function.`);
    }
    if (typeof trigger.key !== "function") {
      throw new Error(`${where}: trigger '${trigger.id}' needs a key(payload) function.`);
    }
    if (
      trigger.action !== undefined &&
      (!TRIGGER_ACTION_PATTERN.test(trigger.action) || trigger.action === DEFAULT_ACTION_NAME)
    ) {
      throw new Error(
        `${where}: trigger '${trigger.id}' action '${String(trigger.action)}' must match ${String(TRIGGER_ACTION_PATTERN)} and not the reserved 'default'.`,
      );
    }
    if (trigger.debounceMs !== undefined && !isNonNegativeNumber(trigger.debounceMs)) {
      throw new Error(
        `${where}: trigger '${trigger.id}' debounceMs must be a non-negative number.`,
      );
    }
    if (trigger.minIntervalMs !== undefined && !isNonNegativeNumber(trigger.minIntervalMs)) {
      throw new Error(
        `${where}: trigger '${trigger.id}' minIntervalMs must be a non-negative number.`,
      );
    }
    if (trigger.maxConcurrent !== undefined && !isPositiveInteger(trigger.maxConcurrent)) {
      throw new Error(
        `${where}: trigger '${trigger.id}' maxConcurrent must be a positive integer.`,
      );
    }
    if (
      trigger.dailyCap !== undefined &&
      trigger.dailyCap !== null &&
      !isPositiveInteger(trigger.dailyCap)
    ) {
      throw new Error(
        `${where}: trigger '${trigger.id}' dailyCap must be a positive integer or null.`,
      );
    }
    if (typeof trigger.defaultEnabled !== "boolean") {
      throw new Error(
        `${where}: trigger '${trigger.id}' must say defaultEnabled: true or false (the host shows it; a per-project toggle overrides it).`,
      );
    }
  }
}
