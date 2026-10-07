import { describe, expect, it } from "vite-plus/test";

import {
  cancelRunRequest,
  type CloudSessionRepoRef,
  dispatchSessionRequest,
  jobStepsRequest,
  listRunsRequest,
} from "./t3team-githubActionsSessionClient.ts";

const REF: CloudSessionRepoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

describe("requests", () => {
  it("addresses the fleet repository, so a GHE tenant is never mistaken for github.com", () => {
    // The host is the executor's (it picks the credential and the API base URL); every path here
    // must stay relative to it and name the configured owner/repo.
    for (const request of [
      dispatchSessionRequest(REF, {}),
      listRunsRequest(REF, 20),
      jobStepsRequest(REF, 1),
      cancelRunRequest(REF, 1),
    ]) {
      expect(request.kind).toBe("rest");
      if (request.kind !== "rest") continue;
      expect(request.path.startsWith("repos/hive/nx-nexi/")).toBe(true);
    }
  });

  it("dispatches by POSTing the ref, hold_minutes, and session_tag in the body", () => {
    // `session_tag` is the only way to find our own run: workflow_dispatch
    // answers 204 and never reveals the run id it created, so the tag must
    // ride along with the dispatch or the session is unfindable forever.
    const request = dispatchSessionRequest(REF, {
      hold_minutes: "240",
      session_tag: "c9f4a2",
    });
    expect(request).toMatchObject({
      kind: "rest",
      method: "POST",
      path: "repos/hive/nx-nexi/actions/workflows/session.yml/dispatches",
      body: { ref: "main", inputs: { hold_minutes: "240", session_tag: "c9f4a2" } },
    });
  });

  it("reads runs for the session workflow only, bounded by the limit", () => {
    const request = listRunsRequest(REF, 20);
    expect(request.kind === "rest" ? request.path : "").toBe(
      "repos/hive/nx-nexi/actions/workflows/session.yml/runs?per_page=20",
    );
  });

  it("cancels a run by id with POST and no body", () => {
    expect(cancelRunRequest(REF, 248523362)).toMatchObject({
      kind: "rest",
      method: "POST",
      path: "repos/hive/nx-nexi/actions/runs/248523362/cancel",
    });
  });
});
