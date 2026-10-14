// @effect-diagnostics globalDate:off -- A display name uses local wall-clock and Intl labels.
import type { CloudSession } from "@t3tools/contracts";
import * as Cause from "effect/Cause";

import { squashAtomCommandFailure } from "./runtime.ts";

/**
 * How long a cloud session may live: the fleet's ceiling, always. The session workflow's job times
 * out at 350 minutes and the runner is reaped at 390, so nothing longer survives; a session nobody
 * is connected to is released much earlier by the workflow's idle check. A choice here would only
 * let a session end sooner than the user needs it.
 */
export const CLOUD_SESSION_LIFETIME_SECONDS = 345 * 60;

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

/**
 * The description line for a failed cloud-session command's toast.
 *
 * The server's `CloudSessionFailedError.message` is already user-facing copy
 * (e.g. "The GitHub CLI is not signed in to the cloud session host."), so it
 * is surfaced verbatim. Transport-level failures (disconnected environment,
 * missing auth scope) carry their own user-facing `message` as well. Interrupts
 * and defects (an Effect `Cause.die` — a relay drop, a schema/decode failure)
 * are not user-readable and fall back to a generic line rather than leaking
 * wire internals (protocol method names, schema paths, token-bearing URLs).
 */
export function cloudSessionFailureDescription(result: {
  readonly cause: Cause.Cause<unknown>;
}): string {
  if (Cause.hasInterruptsOnly(result.cause)) return "Unknown error.";
  if (Cause.hasDies(result.cause)) return "Unknown error.";
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Unknown error.";
}
