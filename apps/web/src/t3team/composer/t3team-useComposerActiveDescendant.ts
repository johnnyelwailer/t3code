import { useEffect, type RefObject } from "react";

/**
 * Publishes the menu's active option on the prompt editor's editable element.
 *
 * The editable element is rendered by the upstream `ComposerPromptEditor`, which
 * accepts no ARIA props and is outside the t3team additive whitelist, so the
 * attributes are applied imperatively to the element it renders. Without them
 * the highlight is decoration only: assistive tech is never told which option
 * Enter would accept.
 */
export function useT3TeamComposerActiveDescendant(input: {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly listboxId: string;
  readonly menuOpen: boolean;
  readonly activeOptionDomId: string | null;
}) {
  const { containerRef, listboxId, menuOpen, activeOptionDomId } = input;

  useEffect(() => {
    const editable = containerRef.current?.querySelector<HTMLElement>(
      '[data-testid="composer-editor"]',
    );
    if (!editable) return;
    if (!menuOpen) {
      editable.removeAttribute("aria-controls");
      editable.removeAttribute("aria-activedescendant");
      return;
    }
    editable.setAttribute("aria-controls", listboxId);
    if (activeOptionDomId) {
      editable.setAttribute("aria-activedescendant", activeOptionDomId);
    } else {
      editable.removeAttribute("aria-activedescendant");
    }
    return () => {
      editable.removeAttribute("aria-controls");
      editable.removeAttribute("aria-activedescendant");
    };
  }, [activeOptionDomId, containerRef, listboxId, menuOpen]);
}
