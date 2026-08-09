import { describe, expect, it, vi } from "vite-plus/test";

import { buildT3TeamAddProjectJiraSource } from "./t3team-addProjectJiraSource";
import { useT3TeamCreateProjectRequestStore } from "./t3team-createProjectRequest";

describe("buildT3TeamAddProjectJiraSource", () => {
  it("is findable by the words a person would actually type", () => {
    const item = buildT3TeamAddProjectJiraSource({
      environmentId: "env-1",
      iconClassName: "size-4",
      closePalette: () => {},
    });
    expect(item.title).toBe("Jira project");
    for (const term of ["jira", "atlassian", "ticket", "issue", "board", "backlog"]) {
      expect(item.searchTerms).toContain(term);
    }
  });

  it("scopes its value by environment so two environments cannot collide", () => {
    const a = buildT3TeamAddProjectJiraSource({
      environmentId: "env-a",
      iconClassName: "",
      closePalette: () => {},
    });
    const b = buildT3TeamAddProjectJiraSource({
      environmentId: "env-b",
      iconClassName: "",
      closePalette: () => {},
    });
    expect(a.value).not.toBe(b.value);
  });

  // Ordering matters: the palette must be gone before the wizard mounts, or the user sees two
  // stacked overlays.
  it("closes the palette BEFORE requesting the wizard", async () => {
    useT3TeamCreateProjectRequestStore.getState().clear();
    const calls: string[] = [];
    const unsubscribe = useT3TeamCreateProjectRequestStore.subscribe(() => {
      calls.push("request");
    });
    const item = buildT3TeamAddProjectJiraSource({
      environmentId: "env-1",
      iconClassName: "",
      closePalette: () => calls.push("close"),
    });

    await item.run();

    expect(calls).toEqual(["close", "request"]);
    expect(useT3TeamCreateProjectRequestStore.getState().requestId).toBe(1);
    unsubscribe();
  });

  it("registers two consecutive asks (a boolean would swallow the second)", async () => {
    useT3TeamCreateProjectRequestStore.getState().clear();
    const item = buildT3TeamAddProjectJiraSource({
      environmentId: "env-1",
      iconClassName: "",
      closePalette: vi.fn(),
    });
    await item.run();
    const first = useT3TeamCreateProjectRequestStore.getState().requestId;
    useT3TeamCreateProjectRequestStore.getState().clear();
    await item.run();
    expect(useT3TeamCreateProjectRequestStore.getState().requestId).toBe(first);
  });
});
