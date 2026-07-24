import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

import type { ComposerSlashCommand, ComposerTrigger } from "~/composer-logic";
import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";

/** Text replacement to apply to the editor for a selected menu item. */
export type T3workComposerMenuReplacement = {
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
export type T3workComposerMenuSelectionEffect =
  | { readonly type: "open-model-picker" }
  | { readonly type: "built-in-slash-command"; readonly command: ComposerSlashCommand };

export type T3workComposerMenuSelectionPlan = {
  readonly replacement: T3workComposerMenuReplacement;
  readonly effect: T3workComposerMenuSelectionEffect | null;
};

/**
 * Mirrors ChatComposer's `extendReplacementRangeForTrailingSpace`: when the
 * replacement already ends in a space, swallow an existing space at the range
 * end so accepting an item never doubles the separator.
 */
export function extendT3workReplacementRangeForTrailingSpace(
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
): T3workComposerMenuSelectionPlan {
  const rangeEnd = extendT3workReplacementRangeForTrailingSpace(
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
  effect: T3workComposerMenuSelectionEffect | null,
  focusEditorAfterReplace: boolean,
): T3workComposerMenuSelectionPlan {
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
export function resolveT3workComposerMenuSelection(
  item: ComposerCommandItem,
  trigger: ComposerTrigger,
  text: string,
): T3workComposerMenuSelectionPlan | null {
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
  return null;
}
