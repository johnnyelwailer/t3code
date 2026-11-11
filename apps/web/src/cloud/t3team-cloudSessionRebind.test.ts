import { ProjectId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { planCloudSessionRebind } from "./t3team-cloudSessionRebind";

function session(phase: CloudSession["phase"], environmentId?: string): CloudSession {
  return { sessionId: "session-new", phase, environmentId } as CloudSession;
}

const projectOnCloud = {
  environmentId: "env-cloud",
  projectId: ProjectId.make("project-cloud"),
  logicalKey: "polassist",
};
const projectOnOther = {
  environmentId: "env-other",
  projectId: ProjectId.make("project-other"),
  logicalKey: "polassist",
};

const base = {
  session: session("ready", "env-cloud"),
  connectedEnvironmentIds: new Set<string>(),
  projectsOnMachines: [projectOnCloud, projectOnOther],
  projectKey: "polassist",
  draftEnvironmentId: "env-local",
};

describe("planCloudSessionRebind", () => {
  it("reconnects the machine the picked session runs on", () => {
    // The ended session left this environment id registered to itself: same id, stale binding.
    expect(planCloudSessionRebind({ ...base, draftEnvironmentId: "env-cloud" })).toEqual({
      connect: true,
      projectRef: null,
    });
    expect(
      planCloudSessionRebind({
        ...base,
        draftEnvironmentId: "env-cloud",
        connectedEnvironmentIds: new Set(["env-cloud"]),
      }),
    ).toEqual({ connect: false, projectRef: null });
  });

  it("moves an unsent draft onto that machine's copy of the composer project", () => {
    expect(planCloudSessionRebind(base)).toEqual({
      connect: true,
      projectRef: { environmentId: "env-cloud", projectId: "project-cloud" },
    });
  });

  it("still connects when the machine has no copy of the project to move to", () => {
    expect(planCloudSessionRebind({ ...base, projectKey: "other-repo" })).toEqual({
      connect: true,
      projectRef: null,
    });
    expect(planCloudSessionRebind({ ...base, draftEnvironmentId: null })).toEqual({
      connect: true,
      projectRef: null,
    });
  });

  it("does nothing for a session that is not ready or has no machine yet", () => {
    expect(planCloudSessionRebind({ ...base, session: session("preparing", "env-cloud") })).toEqual(
      { connect: false, projectRef: null },
    );
    expect(planCloudSessionRebind({ ...base, session: session("ready") })).toEqual({
      connect: false,
      projectRef: null,
    });
  });
});
