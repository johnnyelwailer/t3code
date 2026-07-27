import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

import type { ComposerSlashCommand, ComposerTrigger } from "~/composer-logic";
import type {
  T3TeamComposerMenuItem,
  T3TeamRecipeSlashCommandItem,
} from "~/t3team/composer/t3team-composerRecipeSlashItems";

/** Text replacement to apply to the editor for a selected menu item. */
export type T3TeamComposerMenuReplacement = {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly replacement: string;
  /**
   * Text the caller must still find at `[rangeStart, rangeEnd)` before
   * applying — guards against the editor changing between menu render and
   * accept (same optimistic check the chat composer performs).
   */
  readonly expectedText: string;
  readonly focusEditorAfterReplace: boolean;
};

/** Host-state side effect a selection triggers in addition to the replacement. */
export type T3TeamComposerMenuSelectionEffect =
  | { readonly type: "open-model-picker" }
  | { readonly type: "built-in-slash-command"; readonly command: ComposerSlashCommand }
  | {
      readonly type: "select-recipe";
      readonly recipe: T3TeamRecipeSlashCommandItem["recipe"];
    };

export type T3TeamComposerMenuSelectionPlan = {
  readonly replacement: T3TeamComposerMenuReplacement;
  readonly effect: T3TeamComposerMenuSelectionEffect | null;
};

/**
 * Mirrors ChatComposer's `extendReplacementRangeForTrailingSpace`: when the
 * replacement already ends in a space, swallow an existing space at the range
 * end so accepting an item never doubles the separator.
 */
export function extendT3TeamReplacementRangeForTrailingSpace(
  text: string,
  rangeEnd: number,
  replacement: string,
): number {
  if (!replacement.endsWith(" ")) {
    return rangeEnd;
  }
  return text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
}

function insertionPlan(
  text: string,
  trigger: ComposerTrigger,
  replacement: string,
): T3TeamComposerMenuSelectionPlan {
  const rangeEnd = extendT3TeamReplacementRangeForTrailingSpace(
    text,
    trigger.rangeEnd,
    replacement,
  );
  return {
    replacement: {
      rangeStart: trigger.rangeStart,
      rangeEnd,
      replacement,
      expectedText: text.slice(trigger.rangeStart, rangeEnd),
      focusEditorAfterReplace: true,
    },
    effect: null,
  };
}

function clearRangePlan(
  text: string,
  trigger: ComposerTrigger,
  effect: T3TeamComposerMenuSelectionEffect | null,
  focusEditorAfterReplace: boolean,
): T3TeamComposerMenuSelectionPlan {
  return {
    replacement: {
      rangeStart: trigger.rangeStart,
      rangeEnd: trigger.rangeEnd,
      replacement: "",
      expectedText: text.slice(trigger.rangeStart, trigger.rangeEnd),
      focusEditorAfterReplace,
    },
    effect,
  };
}

/**
 * Resolves what accepting `item` should do, without performing any effect.
 *
 * Per-kind behavior matches ChatComposer's `onSelectComposerItem`: paths insert
 * a mention token, `/model` clears the typed range and opens the model picker
 * (without refocusing the editor), other built-ins clear the range and switch
 * interaction mode, provider slash commands insert the literal command, skills
 * insert a `$skill` chip.
 */
export function resolveT3TeamComposerMenuSelection(
  item: T3TeamComposerMenuItem,
  trigger: ComposerTrigger,
  text: string,
): T3TeamComposerMenuSelectionPlan | null {
  if (item.type === "path") {
    return insertionPlan(text, trigger, `${serializeComposerFileLink(item.path)} `);
  }
  if (item.type === "slash-command") {
    if (item.command === "model") {
      return clearRangePlan(text, trigger, { type: "open-model-picker" }, false);
    }
    return clearRangePlan(
      text,
      trigger,
      { type: "built-in-slash-command", command: item.command },
      true,
    );
  }
  if (item.type === "provider-slash-command") {
    return insertionPlan(text, trigger, `/${item.command.name} `);
  }
  if (item.type === "skill") {
    return insertionPlan(text, trigger, `$${item.skill.name} `);
  }
  if (item.type === "recipe-slash-command") {
    // Selector, not launcher: clear the typed `/<alias>` and stage the recipe
    // as the composer's pre-submit chip, exactly like clicking its card.
    return clearRangePlan(text, trigger, { type: "select-recipe", recipe: item.recipe }, true);
  }
  return null;
}
