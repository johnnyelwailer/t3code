import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { T3TeamRichChoiceAction } from "./t3team-RichChoiceAction";
import { T3TeamRichChoiceCard } from "./t3team-RichChoiceCard";
import { T3TeamRichChoiceControls } from "./t3team-RichChoiceControls";
import {
  describeRichChoicePosition,
  resolveRichChoiceInitialIndex,
  resolveRichChoiceKey,
  toggleRichChoiceSelection,
  type RichChoiceOption,
} from "./t3team-richChoice.logic";
import { useRichChoiceDrag } from "./t3team-useRichChoiceDrag";

export type { RichChoiceOption } from "./t3team-richChoice.logic";

/**
 * The one choice component for rich options (roles, recipes, presets, agent-offered choices): a
 * peek carousel with one card in full and its neighbours peeking out. Swiping, arrows, keys, dots
 * and clicking a peeking card only move the front card; a choice happens through the explicit
 * "Choose this" action. The app, its stories and the agent `rich-choice` widget all render this.
 */
export function T3TeamRichChoice({
  prompt,
  options,
  defaultId,
  selectedIds = [],
  multiple = false,
  chooseLabel = "Choose this",
  confirmLabel = "Confirm",
  disabled = false,
  onChoose,
  renderBody,
  className,
}: {
  /** Names the group for assistive tech; also shown when `showPrompt` content is wanted by callers. */
  readonly prompt: string;
  readonly options: readonly RichChoiceOption[];
  /** Option shown in front first. */
  readonly defaultId?: string | undefined;
  /**
   * Options already chosen, marked on their cards. Single choice: controlled, the marker follows
   * this prop (the saved setting). Multiple: the initial picks; later ones are kept locally.
   */
  readonly selectedIds?: readonly string[];
  readonly multiple?: boolean;
  readonly chooseLabel?: string;
  readonly confirmLabel?: string;
  /** Browsing still works; choosing does not (answered, superseded or sending). */
  readonly disabled?: boolean;
  readonly onChoose: (ids: readonly string[]) => void;
  readonly renderBody?: ((body: string) => ReactNode) | undefined;
  readonly className?: string;
}) {
  const [index, setIndex] = useState(() => resolveRichChoiceInitialIndex(options, defaultId));
  const [localPicked, setLocalPicked] = useState<readonly string[]>(selectedIds);
  const viewportRef = useRef<HTMLDivElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = options.length;
  const frontIndex = Math.min(index, Math.max(count - 1, 0));
  const front = options[frontIndex];

  const { dragX, dragging, handlers, clearSwallow } = useRichChoiceDrag({
    frontIndex,
    count,
    cardWidth: () => viewportRef.current?.firstElementChild?.firstElementChild?.clientWidth ?? 300,
    onSettle: setIndex,
  });

  if (!front) return null;

  const ids = new Set(options.map((option) => option.id));
  const picked = (multiple ? localPicked : selectedIds).filter((id) => ids.has(id));

  type FocusTarget = "action" | "dot" | null;
  const goTo = (next: number, focus: FocusTarget = null) => {
    setIndex(next);
    if (focus === null) return;
    requestAnimationFrame(() => {
      const root = rootRef.current;
      const target =
        focus === "action"
          ? chooseRef.current
          : root?.querySelector<HTMLElement>(`[data-rc-dot="${next}"]`);
      target?.focus();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    clearSwallow();
    const next = resolveRichChoiceKey(event.key, frontIndex, count);
    if (next === null) return;
    event.preventDefault();
    const origin = event.target instanceof Element ? event.target : null;
    // The focused control is replaced or no longer current once the front card moves: follow it.
    goTo(
      next,
      origin?.closest("[data-rc-action]")
        ? "action"
        : origin?.closest("[data-rc-dot]")
          ? "dot"
          : null,
    );
  };

  const choose = () => {
    const next = toggleRichChoiceSelection(picked, front.id, multiple);
    if (multiple) setLocalPicked(next);
    else onChoose(next);
  };

  const frontChosen = picked.includes(front.id);
  const trackStyle = {
    "--rc-w": "min(78cqw, 32rem)",
    "--rc-gap": "0.75rem",
    transform: `translateX(calc(50cqw - var(--rc-w) / 2 - ${frontIndex} * (var(--rc-w) + var(--rc-gap)) + ${dragX}px))`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={prompt}
      className={cn("w-full space-y-3", className)}
      onKeyDown={onKeyDown}
    >
      <div
        ref={viewportRef}
        className="overflow-hidden py-2 [container-type:inline-size] [touch-action:pan-y] select-none"
        data-dragging={dragging ? "true" : "false"}
        {...handlers}
      >
        <div
          className={cn(
            "flex items-stretch gap-3",
            dragging
              ? "transition-none"
              : "transition-transform duration-500 ease-drawer motion-reduce:duration-150 motion-reduce:ease-linear",
          )}
          style={trackStyle}
        >
          {options.map((option, position) => {
            const isFront = position === frontIndex;
            const label = describeRichChoicePosition(position, count, option.title);
            return (
              <div
                key={option.id}
                role="group"
                aria-roledescription="slide"
                aria-label={label}
                data-option-id={option.id}
                data-front={isFront ? "true" : "false"}
                className={cn(
                  "relative w-[var(--rc-w)] shrink-0 transition-[opacity,scale] duration-500 motion-reduce:duration-150",
                  isFront ? "opacity-100" : "opacity-60 scale-[0.94] motion-reduce:scale-100",
                )}
              >
                <div aria-hidden={isFront ? undefined : true} className="h-full">
                  <T3TeamRichChoiceCard
                    option={option}
                    front={isFront}
                    chosen={picked.includes(option.id)}
                    renderBody={renderBody}
                    footer={
                      isFront ? (
                        <T3TeamRichChoiceAction
                          ref={chooseRef}
                          label={chooseLabel}
                          multiple={multiple}
                          picked={frontChosen}
                          disabled={disabled}
                          onClick={choose}
                        />
                      ) : undefined
                    }
                  />
                </div>
                {isFront ? null : (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Show ${label}`}
                    className="absolute inset-0 z-10 cursor-pointer rounded-3xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => goTo(position, "action")}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <T3TeamRichChoiceControls options={options} frontIndex={frontIndex} onGoTo={goTo} />

      {multiple ? (
        <div className="flex justify-center">
          <Button disabled={disabled || picked.length === 0} onClick={() => onChoose(picked)}>
            {confirmLabel}
            {picked.length > 0 ? ` (${picked.length})` : ""}
          </Button>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {describeRichChoicePosition(frontIndex, count, front.title)}
      </p>
    </div>
  );
}
