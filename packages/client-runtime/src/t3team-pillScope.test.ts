import { describe, expect, it } from "vite-plus/test";

import {
  createPillScopeFilter,
  enabledPillEnvironmentId,
  pickPillScopedProject,
  pillScopeFlagOn,
  UNSCOPED_PILL_SCOPE,
  type PillScope,
} from "./t3team-pillScope.ts";

const projects = [
  { environmentId: "local", id: "app" },
  { environmentId: "cloud", id: "app" },
  { environmentId: "cloud", id: "api" },
];
const ref = (environmentId: string, projectId: string) => ({ environmentId, projectId });
const scope = (patch: Partial<PillScope>): PillScope => ({ ...UNSCOPED_PILL_SCOPE, ...patch });

describe("createPillScopeFilter", () => {
  it.each([
    ["no pill keeps everything", scope({}), [true, true, true]],
    [
      "an environment pill keeps its environment",
      scope({ environmentId: "cloud" }),
      [false, true, true],
    ],
    [
      "a project pill keeps every copy of the project",
      scope({ projectRefs: [ref("local", "app"), ref("cloud", "app")] }),
      [true, true, false],
    ],
    [
      "both pills keep the project's copy in the environment",
      scope({ environmentId: "cloud", projectRefs: [ref("local", "app"), ref("cloud", "app")] }),
      [false, true, false],
    ],
    [
      "a project with no copy in the environment leaves the environment alone",
      scope({ environmentId: "cloud", projectRefs: [ref("local", "app")] }),
      [false, true, true],
    ],
  ])("%s", (_name, pillScope, expected) => {
    const inScope = createPillScopeFilter(pillScope, projects);
    expect(projects.map((project) => inScope(ref(project.environmentId, project.id)))).toEqual(
      expected,
    );
  });
});

describe("pickPillScopedProject", () => {
  const pick = (pillScope: PillScope, offline: string[] = []) =>
    pickPillScopedProject({
      orderedProjects: projects,
      scope: pillScope,
      offlineEnvironmentIds: new Set(offline),
      fallback: projects[0],
    });

  it("starts in the selected environment", () => {
    expect(pick(scope({ environmentId: "cloud" }))).toBe(projects[1]);
  });

  it("starts in the selected project's copy in the selected environment", () => {
    expect(
      pick(
        scope({ environmentId: "cloud", projectRefs: [ref("cloud", "api"), ref("local", "x")] }),
      ),
    ).toBe(projects[2]);
  });

  it("falls back when the scope is unreachable or empty", () => {
    expect(pick(scope({ environmentId: "cloud" }), ["cloud"])).toBe(projects[0]);
    expect(pick(scope({ environmentId: "gone" }))).toBe(projects[0]);
    expect(pick(scope({}))).toBe(projects[0]);
  });
});

describe("pillScopeFlagOn", () => {
  it("is off once any server advertises the flag off; servers without it keep it on", () => {
    expect(pillScopeFlagOn([{}, { featureFlags: { UI_PILL_GLOBAL_SCOPE: true } }])).toBe(true);
    expect(pillScopeFlagOn([{}, { featureFlags: { UI_PILL_GLOBAL_SCOPE: false } }])).toBe(false);
  });
});

describe("enabledPillEnvironmentId", () => {
  it("reads a switched-off environment as All", () => {
    expect(enabledPillEnvironmentId("cloud", new Set(["local", "cloud"]))).toBe("cloud");
    expect(enabledPillEnvironmentId("cloud", new Set(["local"]))).toBeNull();
    expect(enabledPillEnvironmentId(null, new Set(["local"]))).toBeNull();
  });
});
