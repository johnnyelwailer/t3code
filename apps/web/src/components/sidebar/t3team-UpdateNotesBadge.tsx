/** The pill's accent dot: an app update whose notes were not opened yet. */
export function UpdateNotesBadge() {
  return (
    <span
      aria-hidden="true"
      data-testid="update-notes-badge"
      className="pointer-events-none absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-sidebar"
    />
  );
}
