import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useT3TeamSidebarEnvironmentFilterStore } from "./t3team-sidebarEnvironmentFilterStore";

describe("useT3TeamSidebarEnvironmentFilterStore", () => {
  beforeEach(() =>
    useT3TeamSidebarEnvironmentFilterStore.setState({ selectedEnvironmentId: null }),
  );

  it("starts on All and remembers a pick until it is reset", () => {
    const store = useT3TeamSidebarEnvironmentFilterStore;
    expect(store.getState().selectedEnvironmentId).toBeNull();
    store.getState().select("cloud");
    expect(store.getState().selectedEnvironmentId).toBe("cloud");
    store.getState().select(null);
    expect(store.getState().selectedEnvironmentId).toBeNull();
  });

  it("keeps the same state object when the pick does not change", () => {
    const store = useT3TeamSidebarEnvironmentFilterStore;
    store.getState().select("cloud");
    const before = store.getState();
    store.getState().select("cloud");
    expect(store.getState()).toBe(before);
  });
});
