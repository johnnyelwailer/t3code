/**
 * `@t3team/sdk/time` (Epic 27 §Time & scheduling helpers): `nextWeekday` and `nextCron` must be
 * pure transforms of their `fromEpochMs` input — a workflow body replays them from the journal,
 * never from the real clock. These tests pin known dates, purity across repeat calls, and (via
 * `effect`'s own `fast-check` re-export) the properties the spec calls out: the result is
 * always strictly after `fromEpochMs`, and it's the MINIMAL matching instant, not just *a*
 * later one.
 */
import * as DateTime from "effect/DateTime";
import { FastCheck as fc } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { nextCron, nextWeekday, WEEKDAY_NUMBERS, type Weekday } from "./t3team-sdk.time.ts";

const WEEKDAYS: ReadonlyArray<Weekday> = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const EPOCH_RANGE = { min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 0, 1) };

describe("@t3team/sdk/time", () => {
  describe("nextWeekday", () => {
    it("finds the next Monday 09:00 Europe/Zurich from a Wednesday", () => {
      const from = Date.UTC(2026, 8, 23, 8, 0, 0); // Wed 2026-09-23 08:00 UTC
      const result = nextWeekday(from, { weekday: "monday", at: "09:00", tz: "Europe/Zurich" });
      expect(new Date(result).toISOString()).toBe("2026-09-28T07:00:00.000Z"); // CEST = UTC+2
    });

    it("rolls to next week when today's target time already passed", () => {
      const from = Date.UTC(2026, 8, 28, 10, 0, 0); // Mon 2026-09-28 12:00 CEST
      const result = nextWeekday(from, { weekday: "monday", at: "09:00", tz: "Europe/Zurich" });
      expect(new Date(result).toISOString()).toBe("2026-10-05T07:00:00.000Z");
    });

    it("defaults 'at' to local midnight when omitted", () => {
      const from = Date.UTC(2026, 8, 23, 0, 0, 0); // Wed 2026-09-23 00:00 UTC
      const result = nextWeekday(from, { weekday: "thursday", tz: "UTC" });
      expect(new Date(result).toISOString()).toBe("2026-09-24T00:00:00.000Z");
    });

    it("rejects a malformed 'at' string", () => {
      expect(() => nextWeekday(Date.now(), { weekday: "monday", at: "9:00", tz: "UTC" })).toThrow(
        /HH:MM/,
      );
    });

    it("is stable across repeated invocations (pure function of its inputs)", () => {
      const from = Date.UTC(2026, 8, 23, 8, 0, 0);
      const options = { weekday: "friday" as const, at: "14:30", tz: "America/New_York" };
      const first = nextWeekday(from, options);
      const second = nextWeekday(from, options);
      expect(second).toBe(first);
    });

    it("property: result always lands on the requested weekday/local-time, strictly after fromEpochMs", () => {
      fc.assert(
        fc.property(
          fc.integer(EPOCH_RANGE),
          fc.constantFrom(...WEEKDAYS),
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
          (from, weekday, hour, minute) => {
            const at = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
            const tz = "Europe/Zurich";
            const result = nextWeekday(from, { weekday, at, tz });

            expect(result).toBeGreaterThan(from);
            const parts = DateTime.toParts(
              DateTime.setZoneNamedUnsafe(DateTime.makeUnsafe(result), tz),
            );
            expect(parts.weekDay).toBe(WEEKDAY_NUMBERS[weekday]);
            expect(parts.hour).toBe(hour);
            expect(parts.minute).toBe(minute);
          },
        ),
      );
    });
  });

  describe("nextCron", () => {
    it("returns the next Monday 09:00 for '0 9 * * 1' in Europe/Zurich", () => {
      const from = Date.UTC(2026, 8, 23, 8, 0, 0);
      const result = nextCron(from, "0 9 * * 1", { tz: "Europe/Zurich" });
      expect(new Date(result).toISOString()).toBe("2026-09-28T07:00:00.000Z");
    });

    it("is exclusive of an exact match: firing exactly now does not repeat", () => {
      const from = Date.UTC(2026, 8, 28, 7, 0, 0); // exactly Mon 09:00 CEST
      const result = nextCron(from, "0 9 * * 1", { tz: "Europe/Zurich" });
      expect(new Date(result).toISOString()).toBe("2026-10-05T07:00:00.000Z");
    });

    it("property: result is always strictly after fromEpochMs", () => {
      fc.assert(
        fc.property(fc.integer(EPOCH_RANGE), (from) => {
          const result = nextCron(from, "*/15 * * * *", { tz: "UTC" });
          expect(result).toBeGreaterThan(from);
        }),
      );
    });

    it("property: result is the MINIMAL match — the next whole minute after fromEpochMs", () => {
      fc.assert(
        fc.property(fc.integer(EPOCH_RANGE), (from) => {
          const result = nextCron(from, "* * * * *", { tz: "UTC" });
          const expectedMinimal = (Math.floor(from / 60_000) + 1) * 60_000;
          expect(result).toBe(expectedMinimal);
        }),
      );
    });
  });
});
