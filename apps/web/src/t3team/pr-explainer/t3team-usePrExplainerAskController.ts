import type {
  T3TeamPrExplainer,
  T3TeamPrExplainerAnchor,
  T3TeamPrExplainerAskThread,
} from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

import { buildPrExplainerAgentSelection, prExplainerAnchorKey } from "./t3team-prExplainerAnchor";
import type {
  PrExplainerAddToChatHandler,
  PrExplainerAskApi,
  PrExplainerAskHandler,
} from "./t3team-prExplainerAskContext";

/** A box relative to the player's own corner, where a floating Ask card or chip sits. */
export interface PrExplainerAskPlacement {
  readonly anchor: T3TeamPrExplainerAnchor;
  readonly top: number;
  readonly left: number;
  /** The player's width when it opened, to keep the card inside it. */
  readonly containerWidth: number;
}

function placeWithin(root: HTMLElement, at: Element | DOMRect) {
  const box = at instanceof Element ? at.getBoundingClientRect() : at;
  const frame = root.getBoundingClientRect();
  return {
    top: box.bottom - frame.top + 6,
    left: box.left - frame.left,
    containerWidth: frame.width,
  };
}

type SelectionSection = "caption" | "diff" | "visual";

/** The selection, if it lies inside one askable part of this player. */
function readSelection(root: HTMLElement, stepId: string) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const quote = selection.toString().trim();
  if (quote.length === 0) return null;
  const range = selection.getRangeAt(0);
  const start = range.startContainer.parentElement?.closest<HTMLElement>("[data-pxp-section]");
  if (!start || !root.contains(start)) return null;
  const within = start.dataset.pxpSection as SelectionSection;
  const sliceId = start.dataset.pxpSlice;
  const anchor: T3TeamPrExplainerAnchor = {
    stepId,
    target: { kind: "textSelection", within, ...(sliceId ? { sliceId } : {}) },
    quote: quote.slice(0, 2000),
  };
  return { anchor, rect: range.getBoundingClientRect() };
}

/**
 * The player's ask state: which spot's Ask card is open, the selection chip, and the API the
 * askable parts call. Opening an Ask holds autoplay through `onOpenChange`.
 */
export function usePrExplainerAskController(input: {
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly explainer: T3TeamPrExplainer;
  readonly stepId: string | null;
  readonly threads: ReadonlyArray<T3TeamPrExplainerAskThread>;
  readonly onAsk?: PrExplainerAskHandler | undefined;
  readonly onAddToChat?: PrExplainerAddToChatHandler | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { rootRef, explainer, stepId, threads, onAsk, onAddToChat, onOpenChange } = input;
  const [openState, setOpen] = useState<PrExplainerAskPlacement | null>(null);
  const [chipState, setChip] = useState<PrExplainerAskPlacement | null>(null);
  // A new step closes what pointed into the old one.
  const open = openState?.anchor.stepId === stepId ? openState : null;
  const chip = chipState?.anchor.stepId === stepId ? chipState : null;

  useEffect(() => onOpenChange(open !== null), [onOpenChange, open]);

  const openAsk = useCallback(
    (anchor: T3TeamPrExplainerAnchor, at: Element | DOMRect) => {
      const root = rootRef.current;
      if (!root) return;
      setChip(null);
      setOpen({ anchor, ...placeWithin(root, at) });
    },
    [rootRef],
  );

  const addToChat = useCallback(
    (anchor: T3TeamPrExplainerAnchor, request = "") => {
      onAddToChat?.(buildPrExplainerAgentSelection({ explainer, anchor, request }));
      setOpen(null);
    },
    [explainer, onAddToChat],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !stepId || !onAsk) return;
    const update = () => {
      const found = readSelection(root, stepId);
      setChip(found ? { anchor: found.anchor, ...placeWithin(root, found.rect) } : null);
    };
    // Read after the browser settles the selection, not mid-drag.
    const onUp = (event: Event) => {
      // Pointer work inside the Ask card or chip is not a new selection.
      if (event.target instanceof Element && event.target.closest("[data-pxp-ask-ui]")) return;
      window.setTimeout(update, 0);
    };
    root.addEventListener("pointerup", onUp);
    root.addEventListener("keyup", onUp);
    return () => {
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("keyup", onUp);
    };
  }, [onAsk, rootRef, stepId]);

  const submit = useCallback(
    (question: string) => {
      if (!open || !onAsk) return;
      const key = prExplainerAnchorKey(open.anchor);
      const existing = threads.find((thread) => prExplainerAnchorKey(thread.anchor) === key);
      onAsk({ anchor: open.anchor, question, ...(existing ? { threadId: existing.id } : {}) });
      setOpen(null);
    },
    [onAsk, open, threads],
  );

  const api = useMemo<PrExplainerAskApi>(
    () => ({
      explainer,
      threads,
      activeKey: open ? prExplainerAnchorKey(open.anchor) : null,
      canAsk: onAsk !== undefined,
      canAddToChat: onAddToChat !== undefined,
      openAsk,
      addToChat,
    }),
    [addToChat, explainer, onAddToChat, onAsk, open, openAsk, threads],
  );

  return {
    api,
    open,
    chip,
    close: () => setOpen(null),
    submit,
    openChip: () => chip && setOpen(chip),
  };
}
