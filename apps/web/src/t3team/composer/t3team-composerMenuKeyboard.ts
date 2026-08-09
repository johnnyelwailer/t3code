/** Keys the t3team composer command menu claims while it is open. */
export type T3TeamComposerMenuKey = "ArrowDown" | "ArrowUp" | "Enter" | "Tab" | "Escape";

/**
 * What a key press should do to the menu, resolved without touching React state
 * so the decision is unit-testable and identical for every composer surface.
 */
export type T3TeamComposerMenuKeyAction =
  | { readonly type: "ignore" }
  | { readonly type: "highlight"; readonly itemId: string }
  | { readonly type: "accept"; readonly itemId: string }
  | { readonly type: "close" };

/**
 * Stable DOM id for a menu option, derived from the item id.
 *
 * `aria-activedescendant` has to name an element id, so the ids may not be
 * generated per render. Item ids embed `:` and `/` (path and provider items),
 * which are legal in an HTML id but awkward in selectors, so every character
 * outside `[A-Za-z0-9-]` is escaped as `_<hex>_`. The escape is injective
 * (`_` is escaped too), so two different items can never share an id.
 */
export function t3teamComposerMenuOptionDomId(listboxId: string, itemId: string): string {
  const encoded = itemId.replace(
    /[^a-zA-Z0-9-]/g,
    (character) => `_${character.codePointAt(0)?.toString(16) ?? "x"}_`,
  );
  return `${listboxId}-option-${encoded}`;
}

/**
 * Resolves a key press against the rendered option list.
 *
 * Navigation wraps in both directions and starts from the first item on
 * `ArrowDown` / the last on `ArrowUp` when nothing is highlighted yet. Accept
 * keys fall back to the first option so pressing Enter straight after typing
 * accepts the option the menu already shows as active — the same rule
 * `ChatComposer.onComposerCommandKey` applies inline.
 */
export function resolveT3TeamComposerMenuKey(input: {
  readonly key: T3TeamComposerMenuKey;
  readonly items: ReadonlyArray<{ readonly id: string }>;
  readonly activeItemId: string | null;
}): T3TeamComposerMenuKeyAction {
  if (input.key === "Escape") {
    return { type: "close" };
  }
  if (input.items.length === 0) {
    return { type: "ignore" };
  }
  if (input.key === "ArrowDown" || input.key === "ArrowUp") {
    const currentIndex = input.items.findIndex((item) => item.id === input.activeItemId);
    const normalizedIndex = currentIndex >= 0 ? currentIndex : input.key === "ArrowDown" ? -1 : 0;
    const offset = input.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (normalizedIndex + offset + input.items.length) % input.items.length;
    const nextItemId = input.items[nextIndex]?.id;
    return nextItemId ? { type: "highlight", itemId: nextItemId } : { type: "ignore" };
  }
  const acceptItemId =
    input.items.find((item) => item.id === input.activeItemId)?.id ?? input.items[0]?.id;
  return acceptItemId ? { type: "accept", itemId: acceptItemId } : { type: "ignore" };
}
