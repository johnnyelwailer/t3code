/**
 * The plain JSON boundary of the recipe-trigger settings doc (S5b). No Effect import, on
 * purpose: raw JSON ops live in a dedicated helper (the same isolation as
 * `serializeBacklogCacheJson`), so the effect-importing settings module stays free of the
 * preferSchemaOverJson diagnostic.
 */
export const parseRecipeTriggerSettingsJson = (raw: string): unknown => JSON.parse(raw);

export const stringifyRecipeTriggerSettingsJson = (value: unknown): string =>
  JSON.stringify(value, null, 2);
