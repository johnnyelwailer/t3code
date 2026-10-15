import { beforeEach, describe, expect, it } from "vite-plus/test";

import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";
import {
  clearCloudSessionTarget,
  cloudSessionTargetsNeedListRefresh,
  getCloudSessionTarget,
  getCloudSessionTargets,
  resolveCloudSessionCreating,
  selectCloudSessionCreating,
} from "./t3team-cloudSessionTargetStore";

describe("cloudSessionTargetStore", () => {
  beforeEach(() => {
    clearCloudSessionTarget("draft-1");
  });

  it("selects a creating sentinel immediately, then resolves to the real session", () => {
    selectCloudSessionCreating("draft-1", "New cloud session");
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: CLOUD_SESSION_CREATING_ID,
      label: "New cloud session",
    });
    expect(cloudSessionTargetsNeedListRefresh(getCloudSessionTargets())).toBe(true);
    resolveCloudSessionCreating("draft-1", "session-9", "nexi-machine-qa · 7:00 PM");
    expect(getCloudSessionTarget("draft-1")).toMatchObject({
      sessionId: "session-9",
      label: "nexi-machine-qa · 7:00 PM",
    });
    expect(cloudSessionTargetsNeedListRefresh(getCloudSessionTargets())).toBe(false);
  });
});
