import { assert, describe, expect, it } from "@effect/vitest";

import {
  parseSessionRunIdentity,
  parseSnapshotCacheKey,
  resumeBranchName,
  resumeTipHasUnpushedWork,
  sessionRepositoryInput,
  wipBranchName,
} from "./t3team-CloudSessionDelete.ts";
import { plainProjectDispatchInputs } from "./t3team-cloudSessionPlainProject.ts";
import { parseCachesResponse, parseRunResponse } from "./t3team-githubActionsSessionParse.ts";

const HIVE = { host: "nexplore.ghe.com", owner: "hive", name: "nx-nexi" };

describe("parseSessionRunIdentity", () => {
  it("reads the workspace and repository markers from a machine session's name", () => {
    const identity = parseSessionRunIdentity(
      "nexi-session [s1] · machine · setup · ws m-pj.hive.nx-nexi_ · repo nexplore.ghe.com/hive/nx-nexi",
    );
    assert.equal(identity.workspace, "m-pj.hive.nx-nexi_");
    assert.deepEqual(identity.repository, HIVE);
  });

  it("reads a plain session's repository without a workspace", () => {
    const identity = parseSessionRunIdentity("nexi-session [s1] · repo github.com/other/acme");
    assert.equal(identity.workspace, null);
    assert.deepEqual(identity.repository, { host: "github.com", owner: "other", name: "acme" });
  });

  it("reads nothing from an old-format name, nor a repository without its host", () => {
    assert.deepEqual(parseSessionRunIdentity("nexi-session [s1]"), {
      workspace: null,
      repository: null,
    });
    assert.equal(parseSessionRunIdentity("nexi-session [s1] · repo hive/nx-nexi").repository, null);
  });

  it("never mistakes the standby marker for a workspace", () => {
    const identity = parseSessionRunIdentity(
      "nexi-session [s1] · machine · repo nexplore.ghe.com/hive/nx-nexi · standby ab12",
    );
    assert.equal(identity.workspace, null);
    assert.deepEqual(identity.repository, HIVE);
  });
});

describe("sessionRepositoryInput", () => {
  it("is what the run name's repository marker reads back", () => {
    const input = sessionRepositoryInput(HIVE);
    assert.equal(input, "nexplore.ghe.com/hive/nx-nexi");
    const identity = parseSessionRunIdentity(`nexi-session [s1] · machine · ws w_ · repo ${input}`);
    assert.deepEqual(identity.repository, HIVE);
  });

  it("rides with a plain checkout's dispatch inputs", () => {
    const inputs = plainProjectDispatchInputs({
      kind: "checkout",
      checkout: {
        repository: { url: "https://h/acme/api.git", host: "h", owner: "acme", name: "api" },
        commit: "a".repeat(40),
        token: "t",
        author: { name: "N", email: "e@example.test" },
      },
    });
    assert.equal(inputs["session_repository"], "h/acme/api");
  });
});

describe("parseSnapshotCacheKey", () => {
  // session.yml "Save session snapshot": nexi-session-userdata-<owner>.<workspace>/<run id>[-final]
  it("reads owner, workspace and run from both save keys", () => {
    assert.deepEqual(parseSnapshotCacheKey("nexi-session-userdata-g1283972.m-pj.acme.api_/999"), {
      owner: "g1283972",
      workspace: "m-pj.acme.api_",
      runId: 999,
    });
    const owner = `o${"a1".repeat(16)}`;
    assert.deepEqual(parseSnapshotCacheKey(`nexi-session-userdata-${owner}.u-pj_/999-final`), {
      owner,
      workspace: "u-pj_",
      runId: 999,
    });
  });

  it("rejects keys of another shape", () => {
    assert.isNull(parseSnapshotCacheKey("nexi-session-userdata-u-pj_/999"));
    assert.isNull(parseSnapshotCacheKey("nexi-session-userdata-pj.u-pj_/999"));
    assert.isNull(parseSnapshotCacheKey("other-cache/999"));
  });
});

describe("delete branch names", () => {
  it("names the resume branch as session.yml pushes it: nexi-resume/<snapshot owner>/<workspace>", () => {
    assert.equal(
      resumeBranchName("g1283972", "m-pj.acme.api_"),
      "nexi-resume/g1283972/m-pj.acme.api_",
    );
  });

  it("names the wip branch per run, so a later delete never lands on an earlier save", () => {
    assert.equal(wipBranchName("u-pj_", 999), "wip/nexi-u-pj-999");
    assert.equal(wipBranchName("m-pj.hive.nx-nexi_", 1000), "wip/nexi-m-pj.hive.nx-nexi-1000");
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
          actor: { login: "pj", id: 1283972 },
        },
      }),
    );
    assert.equal(parsed?.id, 999);
    assert.equal(parsed?.status, "in_progress");
    // session.yml names a non-broker run's snapshot owner after it: g<actor id>.
    assert.equal(parsed?.actorId, 1283972);
  });

  it("fails on a body without the run", () => {
    assert.equal(parseRunResponse("{}"), null);
    assert.equal(parseRunResponse("nope"), null);
  });
});
