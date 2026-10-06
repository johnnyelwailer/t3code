import type { CloudSession } from "@t3tools/contracts";

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The name a cloud machine goes by everywhere it is listed: what it is for (its project's
 * repository, else "Cloud session") and when it started, which tells two machines apart.
 */
export function cloudSessionDisplayName(session: CloudSession, now = new Date()): string {
  const base = session.name ?? "Cloud session";
  const started = session.startedAt === undefined ? null : new Date(session.startedAt);
  if (started === null || Number.isNaN(started.getTime())) return base;
  const sameDay = started.toDateString() === now.toDateString();
  return `${base} · ${(sameDay ? timeFormat : dayTimeFormat).format(started)}`;
}
