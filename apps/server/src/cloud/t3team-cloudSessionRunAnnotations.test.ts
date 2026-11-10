import { assert, describe, it } from "@effect/vitest";

import {
  parseAnnotations,
  parseJobIds,
  preserveFailureOf,
  snapshotOnlyProjectsOf,
} from "./t3team-cloudSessionRunAnnotations.ts";

const notice = (message: string) => ({
  level: "notice",
  title: "nexi-snapshot-only-projects",
  message,
});

describe("run annotations", () => {
  it("reads job ids and annotations as GitHub answers them", () => {
    assert.deepEqual(
      parseJobIds(JSON.stringify({ jobs: [{ id: 77, steps: [] }, { id: "x" }] })),
      [77],
    );
    assert.isNull(parseJobIds("nope"));
    const body = JSON.stringify([
      { annotation_level: "notice", title: "nexi-snapshot-only-projects", message: '["notes"]' },
      { annotation_level: "warning", title: null, message: "something" },
    ]);
    assert.deepEqual(parseAnnotations(body), [
      notice('["notes"]'),
      { level: "warning", title: "", message: "something" },
    ]);
    assert.isNull(parseAnnotations("{}"));
  });

  it("names every project a stage reported as living only in the snapshot", () => {
    assert.deepEqual(
      snapshotOnlyProjectsOf([notice('["notes"]'), notice('["notes","IES NG-9c436708"]')]),
      ["notes", "IES NG-9c436708"],
    );
    // No notice: a session from before the notice existed, so the names are unknown.
    assert.isNull(snapshotOnlyProjectsOf([]));
    // An unreadable notice counts as unknown, never as "none".
    assert.isNull(snapshotOnlyProjectsOf([notice("not json")]));
  });

  it("finds machine-preserve.sh's report that the checkout was not saved", () => {
    const warning = (message: string) => ({ level: "warning", title: "", message });
    assert.isNull(
      preserveFailureOf([warning("The machine's repository has stashes; they are not preserved.")]),
    );
    assert.equal(
      preserveFailureOf([
        warning("Could not push the session's checkout; it is lost with this VM."),
      ]),
      "Could not push the session's checkout; it is lost with this VM.",
    );
  });
});
