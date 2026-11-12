/**
 * The copy gate for the cloud wait surfaces: whatever the reason, the level or the missing
 * details, the words a user reads stay free of key=value diagnostics and proof-style claims. The
 * diagnostic itself is the one place those belong, and the card keeps it behind a disclosure.
 */
import { describe, expect, it } from "vite-plus/test";

import type { CloudProjectWait, CloudProjectWaitReason } from "./t3team-cloudProjectWait";
import {
  CLOUD_PROJECT_WAIT_EXPECTED_SECONDS,
  CLOUD_PROJECT_WAIT_SLOW_SECONDS,
  cloudProjectWaitDetail,
  cloudProjectWaitParkedMessage,
  presentCloudProjectWait,
} from "./t3team-cloudProjectWaitPresentation";

const CHECKLIST =
  "UI copy must not show diagnostics (see the UX checklist, https://nexplore.ghe.com/hive/nx-nexi/issues/1283)";
const KEY_VALUE = /\b[a-z][\w-]*=\S/;
const PROOF = /Not yet true/;

const REASONS: ReadonlyArray<CloudProjectWaitReason> = [
  "machine-settings-pending",
  "scratch-folder-unknown",
  "scratch-opening",
  "project-list-pending",
  "project-not-listed",
  "different-repository",
  "different-folder",
  "no-matching-project",
];

const LEVELS = [0, CLOUD_PROJECT_WAIT_EXPECTED_SECONDS, CLOUD_PROJECT_WAIT_SLOW_SECONDS];

/** Named and nameless: the nameless shape is where a reason could fall back to an id or a path. */
const SHAPES: ReadonlyArray<(reason: CloudProjectWaitReason) => CloudProjectWait> = [
  (reason) => ({
    reason,
    environmentId: "env-cloud-1",
    expectedCwd: "/home/runner/work/nx-nexi",
    projectsSeen: 3,
    projectTitle: "nx-nexi",
    machineProjectTitle: "work",
  }),
  (reason) => ({
    reason,
    environmentId: "env-cloud-1",
    expectedCwd: null,
    projectsSeen: 0,
    projectTitle: null,
    machineProjectTitle: null,
  }),
];

function expectPlain(copy: string): void {
  expect(copy, CHECKLIST).not.toMatch(KEY_VALUE);
  expect(copy, CHECKLIST).not.toMatch(PROOF);
  expect(copy.length, CHECKLIST).toBeGreaterThan(0);
}

describe("cloud wait copy", () => {
  it("shows no diagnostics in any reason, at any level, named or not", () => {
    for (const shape of SHAPES) {
      for (const reason of REASONS) {
        const wait = shape(reason);
        expectPlain(cloudProjectWaitDetail(wait));
        expectPlain(cloudProjectWaitParkedMessage(wait));
        for (const seconds of LEVELS) {
          const notice = presentCloudProjectWait(wait, seconds);
          expectPlain(notice.detail);
          if (notice.text !== null) expectPlain(notice.text);
        }
      }
    }
  });

  it("keeps the diagnostic out of the visible copy it is read beside", () => {
    const wait = SHAPES[0]!("project-not-listed");
    const notice = presentCloudProjectWait(wait, CLOUD_PROJECT_WAIT_SLOW_SECONDS);
    expect(notice.diagnostic).toMatch(KEY_VALUE);
    expect(notice.text, CHECKLIST).not.toContain(wait.expectedCwd);
    expect(notice.text, CHECKLIST).not.toContain(wait.environmentId);
  });
});
