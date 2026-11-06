import { assert, describe, expect, it } from "@effect/vitest";

import {
  isSessionSnapshotKeyForRun,
  parseSessionRunIdentity,
  resumeBranchName,
  resumeTipHasUnpushedWork,
  wipBranchName,
} from "./t3team-CloudSessionDelete.ts";
import { parseCachesResponse, parseRunResponse } from "./t3team-githubActionsSessionParse.ts";

describe("parseSessionRunIdentity", () => {
  it("reads the workspace and repository markers from a machine session's name", () => {
    const identity = parseSessionRunIdentity(
      "hive/nx-nexi [main] [s1] · machine · ws m-pj.hive.nx-nexi_ · repo hive/nx-nexi · setup",
    );
    assert.equal(identity.workspace, "m-pj.hive.nx-nexi_");
    assert.deepEqual(identity.repository, { owner: "hive", name: "nx-nexi" });
  });

  it("reads a plain session's repository without a workspace", () => {
    const identity = parseSessionRunIdentity("hive/nx-nexi [main] [s1] · repo other/acme");
    assert.equal(identity.workspace, null);
    assert.deepEqual(identity.repository, { owner: "other", name: "acme" });
  });

  it("reads nothing from an old-format name", () => {
    const identity = parseSessionRunIdentity("hive/nx-nexi [main] [s1]");
    assert.equal(identity.workspace, null);
    assert.equal(identity.repository, null);
  });

  it("never mistakes the standby marker for a workspace", () => {
    const identity = parseSessionRunIdentity(
      "hive/nx-nexi [main] [s1] · machine · repo hive/nx-nexi · standby ab12",
    );
    assert.equal(identity.workspace, null);
    assert.deepEqual(identity.repository, { owner: "hive", name: "nx-nexi" });
  });
});

describe("isSessionSnapshotKeyForRun", () => {
  it("matches the run's snapshot key and its -final variant, under any workspace", () => {
    assert.isTrue(isSessionSnapshotKeyForRun("nexi-session-userdata-u-pj_/999", 999));
    assert.isTrue(isSessionSnapshotKeyForRun("nexi-session-userdata-u-pj_/999-final", 999));
  });

  it("does not match another run, a prefix, or an unrelated key", () => {
    assert.isFalse(isSessionSnapshotKeyForRun("nexi-session-userdata-u-pj_/99", 999));
    assert.isFalse(isSessionSnapshotKeyForRun("nexi-session-userdata-u-pj_/9999", 999));
    assert.isFalse(isSessionSnapshotKeyForRun("other-cache/999", 999));
  });
});

describe("delete branch names", () => {
  it("names the resume branch from the login and workspace", () => {
    assert.equal(resumeBranchName("pj", "u-pj_"), "nexi-resume/pj/u-pj_");
    assert.equal(resumeBranchName("pj", "m-pj.hive.nx-nexi_"), "nexi-resume/pj/m-pj.hive.nx-nexi_");
  });

  it("names the wip branch from the workspace, stable per machine", () => {
    assert.equal(wipBranchName("u-pj_"), "wip/nexi-u-pj");
    assert.equal(wipBranchName("m-pj.hive.nx-nexi_"), "wip/nexi-m-pj.hive.nx-nexi");
  });
});

describe("resumeTipHasUnpushedWork", () => {
  it("sees work when the tip moved past the pinned commit", () => {
    assert.isTrue(resumeTipHasUnpushedWork("sha-b", "sha-a"));
  });

  it("sees work when the pinned commit is unknown (conservative)", () => {
    assert.isTrue(resumeTipHasUnpushedWork("sha-b", null));
  });

  it("sees no work when the tip is the pinned commit", () => {
    assert.isFalse(resumeTipHasUnpushedWork("sha-a", "sha-a"));
  });

  it("sees no work when there is no tip at all", () => {
    assert.isFalse(resumeTipHasUnpushedWork("", "sha-a"));
  });
});

describe("parseCachesResponse", () => {
  it("reads the entries and reports more-pages from a full page", () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, key: `k-${i}` }));
    const parsed = parseCachesResponse(JSON.stringify({ total_count: 250, actions_caches: full }));
    expect(parsed?.entries).toHaveLength(100);
    assert.isTrue(parsed?.hasMore === true);
  });

  it("reports no more pages on a short page", () => {
    const parsed = parseCachesResponse(
      JSON.stringify({ total_count: 2, actions_caches: [{ id: 1, key: "k" }] }),
    );
    assert.isTrue(parsed?.hasMore === false);
    assert.equal(parsed?.entries[0]?.id, 1);
  });

  it("drops entries without a usable id and fails on unreadable bodies", () => {
    const parsed = parseCachesResponse(
      JSON.stringify({
        actions_caches: [{ id: 0, key: "k" }, { key: "no-id" }, { id: 7, key: "j" }],
      }),
    );
    assert.deepEqual(parsed?.entries, [{ id: 7, key: "j" }]);
    assert.equal(parseCachesResponse("not json"), null);
  });
});

describe("parseRunResponse", () => {
  it("reads the single run GitHub answers for GET /actions/runs/{id}", () => {
    const parsed = parseRunResponse(
      JSON.stringify({
        workflow_run: {
          id: 999,
          status: "in_progress",
          conclusion: null,
          created_at: "2026-09-14T12:00:00Z",
          updated_at: "2026-09-14T12:00:01Z",
          html_url: "https://example/runs/999",
          name: "the run",
          actor: { login: "pj" },
        },
      }),
    );
    assert.equal(parsed?.id, 999);
    assert.equal(parsed?.status, "in_progress");
  });

  it("fails on a body without the run", () => {
    assert.equal(parseRunResponse("{}"), null);
    assert.equal(parseRunResponse("nope"), null);
  });
});
