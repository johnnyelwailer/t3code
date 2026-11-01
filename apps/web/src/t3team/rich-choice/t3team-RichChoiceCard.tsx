import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import { splitRichChoiceBody, type RichChoiceOption } from "./t3team-richChoice.logic";

/** Plain paragraphs; callers that have a markdown renderer pass it as `renderBody`. */
function renderPlainBody(body: string): ReactNode {
  return splitRichChoiceBody(body).map((paragraph) => (
    <p key={paragraph} className="whitespace-pre-line">
      {paragraph}
    </p>
  ));
}

/** One card's content. The front card shows everything; peeking cards stay recognisable but quiet. */
export function T3TeamRichChoiceCard({
  option,
  front,
  chosen,
  footer,
  renderBody = renderPlainBody,
}: {
  readonly option: RichChoiceOption;
  readonly front: boolean;
  readonly chosen: boolean;
  /** The front card's action row (the explicit "Choose this"). */
  readonly footer?: ReactNode;
  readonly renderBody?: ((body: string) => ReactNode) | undefined;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border bg-card p-5 text-left shadow-sm sm:p-6",
        chosen ? "border-primary/70 shadow-lg shadow-primary/10" : "border-border/70",
      )}
    >
      <div className="flex items-start gap-4">
        {option.image ? (
          <img
            src={option.image.src}
            alt={option.image.alt ?? ""}
            className="size-20 shrink-0 object-contain sm:size-28"
            draggable={false}
          />
        ) : option.visual ? (
          <span className="flex size-14 shrink-0 items-center justify-center text-primary sm:size-16 [&_svg]:size-9">
            {option.visual}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          {option.tag ? (
            <div className="text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
              {option.tag}
            </div>
          ) : null}
          <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {option.title}
          </h3>
          {chosen ? (
            <div className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <CheckIcon className="size-3.5" aria-hidden />
              Chosen
            </div>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "space-y-2 text-sm leading-6 text-muted-foreground",
          front ? "" : "line-clamp-4",
        )}
      >
        {renderBody(option.body)}
      </div>
      {option.chips && option.chips.length > 0 ? (
        <ul className="mt-auto flex flex-wrap gap-1.5 pt-1" aria-label="What this changes">
          {option.chips.map((chip) => (
            <li
              key={chip}
              className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            >
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
      {footer ? <div className="pt-2">{footer}</div> : null}
    </div>
  );
}
