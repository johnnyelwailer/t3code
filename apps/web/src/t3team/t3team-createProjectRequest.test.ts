import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  requestT3TeamCreateProject,
  useT3TeamCreateProjectRequestStore,
} from "./t3team-createProjectRequest";

const store = useT3TeamCreateProjectRequestStore;

describe("create-project request store", () => {
  beforeEach(() => {
    store.setState({ requestId: 0, preselect: null });
  });

  it("carries a preselect that survives the shell acknowledging the request", () => {
    requestT3TeamCreateProject({ accountId: "acc-a", externalProjectId: "10001" });
    store.getState().clear();
    expect(store.getState().requestId).toBe(0);
    expect(store.getState().preselect).toEqual({ accountId: "acc-a", externalProjectId: "10001" });
    store.getState().consumePreselect();
    expect(store.getState().preselect).toBeNull();
  });

  it("a plain request drops any earlier preselect", () => {
    requestT3TeamCreateProject({ accountId: "acc-a", externalProjectId: "1" });
    requestT3TeamCreateProject();
    expect(store.getState().preselect).toBeNull();
    expect(store.getState().requestId).toBe(2);
  });
});
