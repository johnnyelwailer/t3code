/**
 * The digest's data horizon, in the viewer's time zone: everything the digest can recap must fall
 * between `digestDataWindow`'s start and the start of today. `lastActivityDayWindow` walks back
 * day by day from that horizon to the most recent day before today on which the viewer had any
 * digest activity (a merged pull request or a ticket transition) — their last working day. No
 * activity anywhere in the horizon means there is nothing to recap.
 */

import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import { DIGEST_TRANSITION_RETENTION_MS } from "./t3team-digestStatusTransitions.ts";

export type DigestYesterdayWindow = {
  readonly fromMs: number;
  readonly untilMs: number;
};

/**
 * `timeZone` is an IANA name from the client; an unknown or absent one falls back to this
 * process's own zone (the desktop app's server runs on the viewer's machine).
 */
function zoneFor(timeZone?: string) {
  return Option.getOrElse(
    timeZone !== undefined ? DateTime.zoneMakeNamed(timeZone) : Option.none(),
    () => DateTime.zoneMakeLocal(),
  );
}

function startOfDay(nowMs: number, zone: ReturnType<typeof zoneFor>) {
  return DateTime.startOf(DateTime.setZone(DateTime.makeUnsafe(nowMs), zone), "day");
}

const dayStartMs = (day: ReturnType<typeof startOfDay>) => DateTime.toEpochMillis(day);

/**
 * The shared data horizon: the start of today in the viewer's zone back over the digest's 30-day
 * retention (day-aligned, so the merged-PR read that keys on the window's start stays cache-warm
 * across a whole calendar day), up to the start of today. Today's activity never counts — the
 * recap is about the day the viewer left behind.
 */
export function digestDataWindow(nowMs: number, timeZone?: string): DigestYesterdayWindow {
  const todayMs = dayStartMs(startOfDay(nowMs, zoneFor(timeZone)));
  return { fromMs: todayMs - DIGEST_TRANSITION_RETENTION_MS, untilMs: todayMs };
}

/**
 * The most recent day strictly before today holding any of `activityMs`, walking back day by day
 * from the day before today to the horizon (the retention back from the start of today). Returns
 * that day's own window — start of day to start of the next — or `undefined` when no day in the
 * horizon has activity. `activityMs` is what the caller already read for the whole horizon, so
 * the walk-back adds no reads of its own.
 */
export function lastActivityDayWindow(
  nowMs: number,
  timeZone: string | undefined,
  activityMs: ReadonlyArray<number>,
): DigestYesterdayWindow | undefined {
  const zone = zoneFor(timeZone);
  const todayMs = dayStartMs(startOfDay(nowMs, zone));
  let day = DateTime.subtract(startOfDay(nowMs, zone), { days: 1 });
  const floorMs = dayStartMs(startOfDay(todayMs - DIGEST_TRANSITION_RETENTION_MS, zone));
  for (;;) {
    const fromMs = dayStartMs(day);
    const untilMs = dayStartMs(DateTime.add(day, { days: 1 }));
    if (activityMs.some((ms) => ms >= fromMs && ms < untilMs)) return { fromMs, untilMs };
    if (fromMs <= floorMs) return undefined;
    day = DateTime.subtract(day, { days: 1 });
  }
}
