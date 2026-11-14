import { ExternalLinkIcon } from "lucide-react";

/** Plain release notes and a link to the full history; shared by the update popover and dialog. */
export function UpdateReleaseNotesList({
  heading,
  notes,
  releaseUrl,
  onOpenHistory,
}: {
  readonly heading?: string;
  readonly notes: ReadonlyArray<string>;
  readonly releaseUrl: string | null;
  readonly onOpenHistory: (url: string) => void;
}) {
  if (notes.length === 0 && releaseUrl === null) return null;
  return (
    <section className="flex flex-col gap-2 text-xs" aria-label={heading}>
      {heading ? <h3 className="text-sm leading-5 font-medium">{heading}</h3> : null}
      {notes.length > 0 ? (
        <ul
          className="list-disc space-y-1 pl-4 leading-5 text-popover-foreground/90"
          aria-label="Release notes"
        >
          {notes.map((note) => (
            <li key={note} className="break-words">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
      {releaseUrl !== null ? (
        <a
          className="-mx-1 inline-flex w-fit items-center gap-1 rounded-sm px-1 py-0.5 text-muted-foreground underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          href={releaseUrl}
          onClick={(event) => {
            event.preventDefault();
            onOpenHistory(releaseUrl);
          }}
        >
          Full history
          <ExternalLinkIcon aria-hidden className="size-3 shrink-0" strokeWidth={2} />
        </a>
      ) : null}
    </section>
  );
}
