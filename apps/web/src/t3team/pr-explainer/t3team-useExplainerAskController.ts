import type {
  T3TeamExplainer,
  T3TeamExplainerAnchor,
  T3TeamExplainerAskThread,
} from "./model/t3team-explainer";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { explainerAnchorKey } from "./t3team-explainerAnchor";
import type { ExplainerAddToChatHandler, ExplainerAskHandler } from "./t3team-explainerContext";
import { buildExplainerAgentSelection } from "./t3team-explainerHandoff";
import { readExplainerSelection } from "./t3team-explainerSelection";

/** An open Ask card: the spot, what it points from, and where focus returns on close. */
export interface ExplainerAskOpen {
  readonly anchor: T3TeamExplainerAnchor;
  readonly key: string;
  readonly at: Element | { getBoundingClientRect: () => DOMRect };
  readonly opener: Element | null;
}

const virtual = (rect: DOMRect) => ({ getBoundingClientRect: () => rect });

/**
 * The player's Ask state: which spot's card is open and the selection chip. A new step closes
 * both for good. Opening from the opener that is already open closes instead.
 */
export function useExplainerAskController(input: {
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly explainer: T3TeamExplainer;
  readonly stepId: string | null;
  readonly threads: ReadonlyArray<T3TeamExplainerAskThread>;
  readonly staleSha: string | undefined;
  readonly onAsk?: ExplainerAskHandler | undefined;
  readonly onAddToChat?: ExplainerAddToChatHandler | undefined;
}) {
  const { rootRef, explainer, stepId, threads, staleSha, onAsk, onAddToChat } = input;
  const [open, setOpen] = useState<ExplainerAskOpen | null>(null);
  const [chip, setChip] = useState<(ExplainerAskOpen & { top: number; left: number }) | null>(null);
  const [seenStep, setSeenStep] = useState(stepId);
  if (seenStep !== stepId) {
    setSeenStep(stepId);
    setOpen(null);
    setChip(null);
  }
  // The key an outside press just closed: the press on its own opener must not reopen it.
  const closedByPress = useRef<string | null>(null);

  const openAsk = useCallback(
    (anchor: T3TeamExplainerAnchor, at: Element | DOMRect, opener: Element | null = null) => {
      const key = explainerAnchorKey(anchor);
      if (closedByPress.current === key) {
        closedByPress.current = null;
        return;
      }
      setChip(null);
      setOpen((current) =>
        current?.key === key
          ? null
          : { anchor, key, at: at instanceof Element ? at : virtual(at), opener },
      );
    },
    [],
  );

  const close = useCallback((pressTarget?: EventTarget | null) => {
    setOpen((current) => {
      const opener = current?.opener;
      closedByPress.current =
        current && opener && pressTarget instanceof Node && opener.contains(pressTarget)
          ? current.key
          : null;
      return null;
    });
  }, []);

  const addToChat = useCallback(
    (anchor: T3TeamExplainerAnchor, request = "") => {
      onAddToChat?.(buildExplainerAgentSelection({ explainer, anchor, request, staleSha }));
      setOpen(null);
    },
    [explainer, onAddToChat, staleSha],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !stepId || !onAsk) return;
    let timer: number | undefined;
    // Read after the browser settles the selection, not mid-drag.
    const onUp = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-xp-ask-ui]")) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const found = readExplainerSelection(root, stepId);
        const box = root.getBoundingClientRect();
        setChip(
          found
            ? {
                anchor: found.anchor,
                key: explainerAnchorKey(found.anchor),
                at: virtual(found.rect),
                opener: null,
                // The chip sits under the selection, inside the player.
                top: found.rect.bottom - box.top + 6,
                left: Math.max(8, Math.min(found.rect.left - box.left, box.width - 96)),
              }
            : null,
        );
      }, 0);
    };
    root.addEventListener("pointerup", onUp);
    root.addEventListener("keyup", onUp);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("keyup", onUp);
    };
  }, [onAsk, rootRef, stepId]);

  const submit = useCallback(
    (question: string) => {
      if (!open || !onAsk) return;
      const existing = threads.find((thread) => explainerAnchorKey(thread.anchor) === open.key);
      onAsk({ anchor: open.anchor, question, ...(existing ? { threadId: existing.id } : {}) });
      setOpen(null);
    },
    [onAsk, open, threads],
  );

  return {
    open,
    chip,
    openAsk,
    close,
    submit,
    addToChat,
    openChip: (opener: Element) => chip && setOpen({ ...chip, opener }),
  };
}
