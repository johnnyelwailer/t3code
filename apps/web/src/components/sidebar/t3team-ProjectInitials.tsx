import { cn } from "~/lib/utils";

const TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

/** "nexi-work" → "NW", "Nexi Portal" → "NP", "t3code" → "T3". */
export function projectInitials(name: string): string {
  const words = name.split(/[\s\-_/.]+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? `${words[0]![0]}${words[1]![0]}`
      : (words[0] ?? name).replace(/[^a-z0-9]/gi, "").slice(0, 2);
  return letters.toUpperCase();
}

/** Tone is a stable function of the name, so a project keeps its colour across sessions. */
function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

/**
 * Initials disc for a project with neither favicon nor chosen icon. Drop-in for
 * `ProjectFavicon`'s `fallbackIcon` slot.
 */
export function T3TeamProjectInitials({
  name,
  className,
}: {
  name: string;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold leading-none tracking-tight",
        toneFor(name),
        className,
      )}
    >
      {projectInitials(name)}
    </span>
  );
}
