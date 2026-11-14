import { describe, expect, it } from "@effect/vitest";

import { MODEL, cloudSession } from "./t3team-delegateCloud.fixtures.ts";
import { placementNote } from "./t3team-delegateTaskCloudPlacementNote.ts";

describe("placementNote", () => {
  it("says in one line that the session runs plain, and why, when the project's machine was not used", () => {
    const reason =
      "Commit and push the machine definition in the project first (.agents/nexi/machine.json).";
    const note = placementNote(
      {
        kind: "placed",
        session: cloudSession({ sessionId: "4242", machineFallback: reason }),
        ready: false,
        started: true,
      },
      MODEL,
    );
    expect(note).toContain(`Plain session: the project's machine was not used (${reason})`);
  });

  it("says nothing about a machine when none was in play", () => {
    const note = placementNote(
      { kind: "placed", session: cloudSession({ sessionId: "4242" }), ready: true, started: false },
      MODEL,
    );
    expect(note).not.toContain("Plain session");
  });
});
