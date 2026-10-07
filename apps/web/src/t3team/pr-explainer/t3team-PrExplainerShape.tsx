import type { T3TeamPrExplainerShapeField, T3TeamPrExplainerVisual } from "@t3tools/contracts";

import { cn } from "~/lib/utils";

type Shape = Extract<T3TeamPrExplainerVisual, { kind: "shape" }>;

const MARK = { added: "+", removed: "−", renamed: "~", retyped: "~", unchanged: " " } as const;

const WORD = {
  added: "added",
  removed: "removed",
  renamed: "renamed",
  retyped: "type changed",
  unchanged: "",
} as const;

function FieldRow({ field }: { field: T3TeamPrExplainerShapeField }) {
  const changed = field.change !== "unchanged";
  return (
    <li
      className={cn(
        "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-baseline gap-1 px-2 font-mono text-2xs leading-6",
        field.change === "added" && "bg-diff-addition/10",
        field.change === "removed" && "bg-diff-deletion/10",
        (field.change === "renamed" || field.change === "retyped") && "bg-warning/8",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "text-center",
          field.change === "added" && "text-diff-addition-foreground",
          field.change === "removed" && "text-diff-deletion-foreground",
          (field.change === "renamed" || field.change === "retyped") && "text-warning-foreground",
        )}
      >
        {MARK[field.change]}
      </span>
      <span
        className={cn("min-w-0 truncate", field.change === "removed" && "line-through opacity-70")}
      >
        {field.change === "renamed" && field.was ? (
          <>
            <span className="text-muted-foreground line-through">{field.was}</span>
            <span aria-hidden className="text-muted-foreground">
              {" "}
              →{" "}
            </span>
          </>
        ) : null}
        <span className={cn(changed ? "font-medium text-foreground" : "text-foreground/75")}>
          {field.name}
        </span>
        <span className="text-muted-foreground">: </span>
        {field.change === "retyped" && field.was ? (
          <>
            <span className="text-muted-foreground line-through">{field.was}</span>
            <span aria-hidden className="text-muted-foreground">
              {" "}
              →{" "}
            </span>
          </>
        ) : null}
        <span className="text-info-foreground">{field.type}</span>
      </span>
      {changed ? (
        <span className="font-sans text-2xs text-muted-foreground">{WORD[field.change]}</span>
      ) : null}
    </li>
  );
}

/** A record or payload before and after, one line per field: the schema diff. */
export function PrExplainerShape({ visual }: { visual: Shape }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-card">
      <figcaption className="border-b border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-2xs font-medium">
        {visual.name} {"{"}
      </figcaption>
      <ul aria-label={`Fields of ${visual.name}`} className="py-1">
        {visual.fields.map((field) => (
          <FieldRow key={`${field.was ?? ""}${field.name}`} field={field} />
        ))}
      </ul>
      <div aria-hidden className="px-2.5 pb-1 font-mono text-2xs text-muted-foreground">
        {"}"}
      </div>
    </figure>
  );
}
