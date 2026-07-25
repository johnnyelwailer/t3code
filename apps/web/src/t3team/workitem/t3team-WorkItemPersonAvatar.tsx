import { useState } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import type { WorkItemPerson } from "~/t3team/workitem/t3team-workItemFieldReaders";

const SIZE_CLASSES = {
  sm: "size-5 text-[0.5625rem]",
  md: "size-6 text-[0.625rem]",
  lg: "size-8 text-xs",
} as const;

export type WorkItemAvatarSize = keyof typeof SIZE_CLASSES;

/**
 * Initials are derived from word boundaries so "Ada Lovelace" reads "AL" while a single-word
 * display name still yields something legible. Two characters is the ceiling — three starts to
 * look like a label rather than an avatar.
 */
export function initialsForDisplayName(displayName: string): string {
  const words = displayName
    .split(/[\s._-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
}

/**
 * Person avatar with an initials fallback.
 *
 * The fallback is deliberately single-toned rather than hashed to a per-person colour: a hashed
 * hue cannot honour a workspace theme pack, and a wall of randomly coloured circles competes with
 * the status and priority signals that actually carry meaning here.
 */
export function WorkItemPersonAvatar({
  person,
  size = "md",
  className,
}: {
  readonly person: WorkItemPerson | undefined;
  readonly size?: WorkItemAvatarSize;
  readonly className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const shape = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium select-none",
    SIZE_CLASSES[size],
    className,
  );

  if (!person) {
    return (
      <span
        aria-hidden="true"
        className={cn(shape, "border border-dashed border-border text-muted-foreground/70")}
      />
    );
  }

  if (person.avatarUrl && !imageFailed) {
    return (
      <img
        src={person.avatarUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setImageFailed(true)}
        className={cn(shape, "bg-muted object-cover")}
      />
    );
  }

  return (
    <span aria-hidden="true" className={cn(shape, "bg-muted text-foreground/70")}>
      {initialsForDisplayName(person.displayName)}
    </span>
  );
}

/** Avatar plus name, the standard way a person appears inline throughout the detail view. */
export function WorkItemPersonChip({
  person,
  emptyLabel = "Unassigned",
  size = "md",
  className,
}: {
  readonly person: WorkItemPerson | undefined;
  readonly emptyLabel?: string;
  readonly size?: WorkItemAvatarSize;
  readonly className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <WorkItemPersonAvatar person={person} size={size} />
      <span
        className={cn("truncate text-xs", person ? "text-foreground" : "text-muted-foreground")}
      >
        {person?.displayName ?? emptyLabel}
      </span>
    </span>
  );
}
