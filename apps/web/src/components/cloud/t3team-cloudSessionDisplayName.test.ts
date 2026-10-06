import type { CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cloudSessionDisplayName } from "./t3team-cloudSessionDisplayName";

const session = (fields: Partial<CloudSession>) =>
  ({ sessionId: "1", phase: "ready", machineLabel: "m", ...fields }) as CloudSession;
const now = new Date(2026, 9, 6, 12, 0);

describe("cloudSessionDisplayName", () => {
  it("names a machine by what it is for and when it started", () => {
    const startedAt = new Date(2026, 9, 6, 10, 52).toISOString();
    const name = cloudSessionDisplayName(session({ name: "nexi-machine-qa", startedAt }), now);
    expect(name).toMatch(/^nexi-machine-qa · .*10.52/);
  });

  it("tells two plain sessions apart by their start time", () => {
    const a = cloudSessionDisplayName(
      session({ startedAt: new Date(2026, 9, 6, 10, 52).toISOString() }),
      now,
    );
    const b = cloudSessionDisplayName(
      session({ startedAt: new Date(2026, 9, 6, 11, 7).toISOString() }),
      now,
    );
    expect(a.startsWith("Cloud session · ")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("adds the day for a machine started on an earlier day, and copes without a start", () => {
    const earlier = cloudSessionDisplayName(
      session({ startedAt: new Date(2026, 9, 5, 10, 52).toISOString() }),
      now,
    );
    const sameTimeToday = cloudSessionDisplayName(
      session({ startedAt: new Date(2026, 9, 6, 10, 52).toISOString() }),
      now,
    );
    expect(earlier).not.toBe(sameTimeToday);
    expect(cloudSessionDisplayName(session({}), now)).toBe("Cloud session");
  });
});
