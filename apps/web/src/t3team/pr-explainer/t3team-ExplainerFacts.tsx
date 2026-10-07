import type {
  T3TeamExplainerBlockOf,
  T3TeamExplainerUnsupportedBlock,
} from "./model/t3team-explainer";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  CircleCheckIcon,
  CircleIcon,
  InfoIcon,
  LightbulbIcon,
  ShieldAlertIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TriangleAlertIcon,
  cn,
} from "./t3team-explainerHostKit";

const CALLOUT = {
  info: { variant: "info", Icon: InfoIcon },
  warn: { variant: "warning", Icon: TriangleAlertIcon },
  risk: { variant: "error", Icon: ShieldAlertIcon },
  tip: { variant: "success", Icon: LightbulbIcon },
} as const;

/** A short boxed note; check steps lead with a `warn` or `risk` one. */
export function ExplainerCalloutBlock({ block }: { block: T3TeamExplainerBlockOf<"callout"> }) {
  const tone = CALLOUT[block.tone];
  return (
    <Alert variant={tone.variant}>
      <tone.Icon aria-hidden />
      {block.title ? <AlertTitle>{block.title}</AlertTitle> : null}
      <AlertDescription>{block.text}</AlertDescription>
    </Alert>
  );
}

function Title({ text }: { text: string | undefined }) {
  return text ? (
    <div className="mb-1 text-2xs font-medium text-muted-foreground">{text}</div>
  ) : null;
}

const VALUE_TONE = {
  good: "text-success-foreground",
  bad: "text-destructive-foreground",
  neutral: "text-foreground",
} as const;

export function ExplainerKeyValueBlock({ block }: { block: T3TeamExplainerBlockOf<"keyValue"> }) {
  return (
    <div data-xp-text="block" data-xp-block={block.id}>
      <Title text={block.title} />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
        {block.items.map((item, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- keys may repeat; order is fixed
          <div key={index} className="contents">
            <dt className="text-muted-foreground">{item.key}</dt>
            <dd className={cn("font-medium tabular-nums", VALUE_TONE[item.tone ?? "neutral"])}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ExplainerTableBlock({ block }: { block: T3TeamExplainerBlockOf<"table"> }) {
  return (
    <div data-xp-text="block" data-xp-block={block.id} className="min-w-0 overflow-x-auto">
      <Title text={block.title} />
      <Table>
        <TableHeader>
          <TableRow>
            {block.columns.map((column, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- fixed column order
              <TableHead key={index}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {block.rows.map((row, rowIndex) => (
            // oxlint-disable-next-line react/no-array-index-key -- fixed row order
            <TableRow key={rowIndex}>
              {row.map((cell, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- fixed column order
                <TableCell key={index}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** "How to verify" as numbered steps, or a list of things to tick. */
export function ExplainerChecklistBlock({ block }: { block: T3TeamExplainerBlockOf<"checklist"> }) {
  const steps = (block.style ?? "steps") === "steps";
  const List = steps ? "ol" : "ul";
  return (
    <div>
      <Title text={block.title} />
      <List className="space-y-1 text-xs">
        {block.items.map((item, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- fixed order
          <li key={index} className="flex items-start gap-1.5">
            {steps ? (
              <span className="mt-px w-4 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
                {index + 1}.
              </span>
            ) : item.done ? (
              <CircleCheckIcon
                aria-label="Done"
                className="mt-0.5 size-3.5 shrink-0 text-success"
              />
            ) : (
              <CircleIcon
                aria-label="To do"
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
            )}
            <span className="min-w-0 flex-1 text-foreground/90">{item.text}</span>
          </li>
        ))}
      </List>
    </div>
  );
}

/** A block this build cannot draw: a quiet line, never an error the reader has to parse. */
export function ExplainerUnsupportedBlock({ block }: { block: T3TeamExplainerUnsupportedBlock }) {
  return (
    <div className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-2xs text-muted-foreground">
      {block.reason === "invalid"
        ? `This ${block.sourceType || "part"} could not be shown.`
        : "This part needs a newer version to show."}
    </div>
  );
}
