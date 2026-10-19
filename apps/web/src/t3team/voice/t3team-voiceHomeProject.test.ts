import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { pickVoiceHomeProject } from "./t3team-voiceHomeProject";

const a = ProjectId.make("a");
const b = ProjectId.make("b");

describe("pickVoiceHomeProject", () => {
  it("prefers the project of the thread the user has open", () => {
    expect(pickVoiceHomeProject({ openThreadProjectId: b, projectIds: [a, b] })).toBe(b);
  });

  it("falls back to the first project, and to none when there are no projects", () => {
    expect(pickVoiceHomeProject({ openThreadProjectId: null, projectIds: [a, b] })).toBe(a);
    expect(pickVoiceHomeProject({ openThreadProjectId: null, projectIds: [] })).toBeNull();
  });
});
