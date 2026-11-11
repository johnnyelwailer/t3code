import { EnvironmentId, ProjectId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi, type Mock } from "vite-plus/test";

import { render } from "../../test/render";

const CLOUD = EnvironmentId.make("env-cloud");
const LOCAL = EnvironmentId.make("env-local");
const SCOPE = "draft-follow";

interface World {
  /** Machines `useAddProjectTargets` reports as connected and able to clone. */
  targets: Array<{ environmentId: string; label: string; machine: string }>;
  projects: Array<{ environmentId: string; id: string }>;
  open: Mock;
  opened: boolean;
  listeners: Set<() => void>;
}

const world = vi.hoisted((): World => ({
  targets: [],
  projects: [],
  open: vi.fn(),
  opened: false,
  listeners: new Set(),
}));

// The dialog stands in for the real one: the assertion is that a dialog appears only after a
// click, not what it contains.
vi.mock("~/components/AddProjectToMachineDialog", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    openAddProjectToMachine: (request: unknown) => {
      world.open(request);
      world.opened = true;
      for (const listener of world.listeners) listener();
    },
    AddProjectToMachineDialogHost: () => {
      const isOpen = useSyncExternalStore(
        (listener: () => void) => {
          world.listeners.add(listener);
          return () => world.listeners.delete(listener);
        },
        () => world.opened,
        () => world.opened,
      );
      return isOpen ? <div role="dialog">Add to another machine</div> : null;
    },
  };
});
vi.mock("~/state/entities", () => ({
  useProject: () => ({
    environmentId: LOCAL,
    id: "project-local",
    title: "POLAssist",
    repositoryIdentity: { displayName: "POLAssist" },
  }),
  useProjects: () => world.projects,
}));
vi.mock("~/hooks/useSettings", () => ({ useClientSettings: () => ({}) }));
vi.mock("~/hooks/useLogicalProjectEnvironments", () => ({
  useLogicalProjectEnvironments: () => [],
}));
vi.mock("~/hooks/useAddProjectTargets", () => ({ useAddProjectTargets: () => world.targets }));
vi.mock("@t3tools/client-runtime/state/project-grouping", () => ({
  selectProjectGroupingSettings: () => ({}),
  deriveLogicalProjectKeyFromSettings: () => "polassist",
}));

const { AddProjectToMachineDialogHost } = await import("~/components/AddProjectToMachineDialog");
const { clearCloudProjectCloneSuggestion, suggestCloudProjectClone } =
  await import("./t3team-cloudProjectCloneSuggestion");
const { useCloudProjectCloneBanner } = await import("./t3team-useCloudProjectCloneBanner");
const { useCloudSessionProjectFollow } = await import("./t3team-useCloudSessionProjectFollow");
const { selectCloudSessionTarget, clearCloudSessionTarget } =
  await import("./t3team-cloudSessionTargetStore");

const projectRef = { environmentId: LOCAL, projectId: ProjectId.make("project-local") };
const sessions = [
  { sessionId: "session-new", phase: "ready", environmentId: String(CLOUD) },
] as unknown as CloudSession[];

/** The composer's mount: the follow effect, the inline offer, and the dialog host together. */
function Probe() {
  useCloudSessionProjectFollow({
    scopeKey: SCOPE,
    draftId: SCOPE,
    projectKey: "polassist",
    projectRef,
    sessions,
  });
  const banner = useCloudProjectCloneBanner(SCOPE);
  return (
    <>
      {banner === null ? null : (
        <div>
          <span>{banner.title}</span>
          {banner.actions}
        </div>
      )}
      <AddProjectToMachineDialogHost />
    </>
  );
}

function setup(targets: World["targets"], projects: World["projects"] = []) {
  world.open.mockReset();
  world.opened = false;
  world.targets = targets;
  world.projects = projects;
  clearCloudProjectCloneSuggestion(SCOPE);
  clearCloudSessionTarget(SCOPE);
  // The target was stamped for another project, so the follow path has to react.
  selectCloudSessionTarget({
    scopeKey: SCOPE,
    sessionId: "session-new",
    label: "pti-polassist",
    projectKey: "other-project",
  });
}

const reachable = [{ environmentId: String(CLOUD), label: "pti-polassist", machine: "cloud" }];

describe("project missing on the cloud machine", () => {
  it("offers the clone inline and opens no dialog until the offer is clicked", async () => {
    setup(reachable);
    await using screen = await render(<Probe />, { router: false });
    await expect.element(screen.getByText("POLAssist is not on pti-polassist yet")).toBeVisible();
    expect(screen.container.querySelector("[role=dialog]")).toBeNull();
    expect(world.open).not.toHaveBeenCalled();

    await screen.getByRole("button", { name: "Add to machine" }).click();
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    expect(world.open).toHaveBeenCalledWith({ projectRef, targetEnvironmentId: CLOUD });
  });

  it("offers nothing while the machine is not reachable, rather than an empty dialog", async () => {
    setup([]);
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.textContent).not.toContain("is not on");
    expect(screen.container.querySelector("[role=dialog]")).toBeNull();
    expect(world.open).not.toHaveBeenCalled();
  });

  it("drops an earlier offer once the machine has the project", async () => {
    setup(reachable, [{ environmentId: String(CLOUD), id: "project-cloud" }]);
    suggestCloudProjectClone({ scopeKey: SCOPE, projectRef, targetEnvironmentId: CLOUD });
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.textContent).not.toContain("is not on");
  });
});
