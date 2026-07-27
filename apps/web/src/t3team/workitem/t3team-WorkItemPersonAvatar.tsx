import { User } from "lucide-react";
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
  isCurrentUser = false,
  className,
}: {
  readonly person: WorkItemPerson | undefined;
  readonly size?: WorkItemAvatarSize;
  /** Rings the avatar so your own work is findable by glance in a long list. */
  readonly isCurrentUser?: boolean;
  readonly className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const shape = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium select-none",
    SIZE_CLASSES[size],
    // A ring rather than a different fill: it survives an avatar photo, which a fill would cover.
    isCurrentUser && "ring-2 ring-primary ring-offset-1 ring-offset-background",
    className,
  );

  if (!person) {
    /*
      A glyph, not an empty dashed ring. `--border` is 6% white in dark themes, so an outline-only
      placeholder was almost invisible there and read as a rendering artefact rather than as
      "nobody". A muted silhouette says the same thing legibly in both themes.
    */
    return (
      <span aria-hidden="true" className={cn(shape, "bg-muted text-muted-foreground/70")}>
        <User className="size-[62%]" />
      </span>
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
/**
 * Whether a displayed person is the signed-in user.
 *
 * One comparison, shared. Each call site doing its own `trim().toLowerCase()` is how the "assigned
 * to me" ring ended up on some chips and not others — a chip rendered through
 * `WorkItemAssigneeControl` never received the flag at all, so the marker silently vanished
 * everywhere the interactive control replaced a plain avatar.
 */
export function isWorkItemCurrentUser(
  person: WorkItemPerson | undefined,
  currentUserName: string | undefined,
): boolean {
  if (!person || !currentUserName) return false;
  return person.displayName.trim().toLowerCase() === currentUserName.trim().toLowerCase();
}

export function WorkItemPersonChip({
  person,
  emptyLabel = "Unassigned",
  size = "md",
  currentUserName,
  isCurrentUser,
  className,
}: {
  readonly person: WorkItemPerson | undefined;
  readonly emptyLabel?: string;
  readonly size?: WorkItemAvatarSize;
  /** Preferred over `isCurrentUser`: the chip derives the marker so no caller can forget it. */
  readonly currentUserName?: string | undefined;
  readonly isCurrentUser?: boolean;
  readonly className?: string;
}) {
  const marksCurrentUser = isCurrentUser ?? isWorkItemCurrentUser(person, currentUserName);

  return (
    /*
      The name is always rendered here. Hiding it is the container's business, not the chip's: this
      element shrinks to fit its content, so a container query on it is self-referential — hide the
      name, the chip narrows, the query stays unmatched and the name can never come back. It
      collapsed the avatar to a sliver in the details panel.

      A caller with a definite width (a fixed grid column) hides the name by styling
      `[data-slot=person-name]` on its own container, where the width does not depend on the answer.
    */
    <span
      className={cn("flex min-w-0 items-center gap-1.5", className)}
      title={
        person
          ? marksCurrentUser
            ? `${person.displayName} (you)`
            : person.displayName
          : emptyLabel
      }
    >
      <WorkItemPersonAvatar person={person} size={size} isCurrentUser={marksCurrentUser} />
      <span
        data-slot="person-name"
        className={cn("truncate text-xs", person ? "text-foreground" : "text-muted-foreground")}
      >
        {person?.displayName ?? emptyLabel}
      </span>
    </span>
  );
}
