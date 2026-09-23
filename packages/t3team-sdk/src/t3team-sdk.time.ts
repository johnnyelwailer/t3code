/**
 * `@t3team/sdk/time` — pure calendar helpers for scheduled workflows (Epic 27 §Time &
 * scheduling helpers, docs/t3team-mvp/27-scheduled-workflows.md). Every helper here takes the
 * journaled `now()` as its first argument and returns a plain epoch-millis number: neither
 * helper reads the real clock, so a body that builds `waitUntil` deadlines from them stays
 * replay-safe (Epic 27's one rule: "a time helper must source 'now' from the journaled clock,
 * never read the real clock itself").
 *
 * `tz` is REQUIRED on every option here, never defaulted. The spec's own examples always pass
 * it (`tz: "Europe/Zurich"`) and never states a fallback; a silent host-locale default would
 * make the same workflow body compute a different wake instant depending on which machine
 * replays it — exactly the nondeterminism this module exists to prevent. Callers must say which
 * calendar they mean. (Deviation from the spec text, called out in the PR: this is a resolved
 * ambiguity, not a documented requirement.)
 */
import { CronExpressionParser } from "cron-parser";
import * as DateTime from "effect/DateTime";

export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

/** `weekDay` numbering to match `effect/DateTime`'s `PartsWithWeekday` (JS `getUTCDay`: 0 = Sunday). */
export const WEEKDAY_NUMBERS: Readonly<Record<Weekday, number>> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export interface NextWeekdayOptions {
  readonly weekday: Weekday;
  /** Local time-of-day, `"HH:MM"` (24h). Defaults to midnight (`"00:00"`) when omitted. */
  readonly at?: string;
  /** IANA time zone, e.g. `"Europe/Zurich"`. Required — see module doc. */
  readonly tz: string;
}

const AT_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseAt(at: string): { readonly hour: number; readonly minute: number } {
  const match = AT_PATTERN.exec(at);
  if (match === null) {
    throw new Error(`nextWeekday: "at" must be a "HH:MM" 24h time, got ${JSON.stringify(at)}.`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * The next `options.weekday` at local `options.at` (default midnight) in `options.tz`,
 * strictly after `fromEpochMs`. A pure transform of its inputs via `effect/DateTime` — safe to
 * call on every replay, including from inside `waitUntil(nextWeekday(now(), ...))`.
 */
export function nextWeekday(fromEpochMs: number, options: NextWeekdayOptions): number {
  const { hour, minute } = parseAt(options.at ?? "00:00");
  const targetWeekDay = WEEKDAY_NUMBERS[options.weekday];

  const zoned = DateTime.setZoneNamedUnsafe(DateTime.makeUnsafe(fromEpochMs), options.tz);
  const currentWeekDay = DateTime.toParts(zoned).weekDay;
  const daysUntil = (targetWeekDay - currentWeekDay + 7) % 7;

  let candidate = DateTime.setParts(DateTime.add(zoned, { days: daysUntil }), {
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });
  if (DateTime.toEpochMillis(candidate) <= fromEpochMs) {
    candidate = DateTime.add(candidate, { days: 7 });
  }
  return DateTime.toEpochMillis(candidate);
}

export interface NextCronOptions {
  /** IANA time zone, e.g. `"Europe/Zurich"`. Required — see module doc. */
  readonly tz: string;
}

/**
 * The next firing of the 5- or 6-field cron `expression`, strictly after `fromEpochMs`, read in
 * `options.tz`. Backed by `cron-parser`; `currentDate` is always the journaled instant passed
 * in, so the library never touches the real clock (Epic 27: "Neither reads the clock — they
 * transform the journaled instant").
 */
export function nextCron(
  fromEpochMs: number,
  expression: string,
  options: NextCronOptions,
): number {
  const interval = CronExpressionParser.parse(expression, {
    currentDate: fromEpochMs,
    tz: options.tz,
  });
  return interval.next().getTime();
}
