/**
 * "Yesterday" for the digest: the previous working day, in the viewer's time zone. On a Monday
 * that is Friday, and the window runs on to the start of today so the weekend's work is not lost.
 */

import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

export type DigestYesterdayWindow = {
  readonly fromMs: number;
  readonly untilMs: number;
};

/** Days back from `weekDay` (0 = Sunday) to the previous working day: Mon -> Fri, Sun -> Fri. */
function daysBackToWorkingDay(weekDay: number): number {
  if (weekDay === 1) return 3;
  if (weekDay === 0) return 2;
  return 1;
}

/**
 * `timeZone` is an IANA name from the client; an unknown or absent one falls back to this
 * process's own zone (the desktop app's server runs on the viewer's machine).
 */
export function digestYesterdayWindow(nowMs: number, timeZone?: string): DigestYesterdayWindow {
  const zone = Option.getOrElse(
    timeZone !== undefined ? DateTime.zoneMakeNamed(timeZone) : Option.none(),
    () => DateTime.zoneMakeLocal(),
  );
  const today = DateTime.startOf(DateTime.setZone(DateTime.makeUnsafe(nowMs), zone), "day");
  const from = DateTime.subtract(today, {
    days: daysBackToWorkingDay(DateTime.getPart(today, "weekDay")),
  });
  return { fromMs: DateTime.toEpochMillis(from), untilMs: DateTime.toEpochMillis(today) };
}
