import { BrokerConnectionTarget, RelayConnectionTarget } from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, type RepositoryIdentity } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

// The module under test wires the app's catalog and project atoms at import; the test drives the
// factory with its own atoms, so the app connection stack (and the native modules behind it) stay
// out.
vi.mock("../connection/catalog", () => ({ environmentCatalog: {} }));
vi.mock("./projects", () => ({ environmentProjects: {} }));

import { createCloudAdoptionAtoms } from "./t3team-cloudAdoption";

const DESKTOP = EnvironmentId.make("env-desktop");
const MACHINE = EnvironmentId.make("env-machine");

const REMOTE = "https://nexplore.ghe.com/hive/nx-nexi.git";
const identity = (remoteUrl: string): RepositoryIdentity => ({
  canonicalKey: remoteUrl,
  locator: { source: "git-remote", remoteName: "origin", remoteUrl },
  displayName: remoteUrl,
});

const project = (
  environmentId: EnvironmentId,
  id: string,
  title: string,
  remoteUrl: string | null,
  patch: Partial<EnvironmentProject> = {},
): EnvironmentProject => ({
  environmentId,
  id: ProjectId.make(id),
  title,
  workspaceRoot: `/work/${id}`,
  repositoryIdentity: remoteUrl === null ? null : identity(remoteUrl),
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...patch,
});

const jira = {
  provider: "atlassian" as const,
  accountId: "c1",
  externalProjectId: "10",
  externalProjectKey: "NEXI",
};

/** The user's Jira project (linked repository) on the desktop, and the machine's checkout of it. */
const selected = project(DESKTOP, "nexi", "Nexi AI", REMOTE, { source: jira });
const checkout = project(MACHINE, "checkout", "nx-nexi", REMOTE);

const catalogOf = (
  ...entries: Array<
    [EnvironmentId, (id: EnvironmentId) => RelayConnectionTarget | BrokerConnectionTarget]
  >
): EnvironmentCatalogState => ({
  isReady: true,
  entries: new Map(
    entries.map(([environmentId, target]) => [
      environmentId,
      {
        target: target(environmentId),
        enabled: true,
        profile: Option.none(),
      },
    ]),
  ),
});

const relay = (id: EnvironmentId) => new RelayConnectionTarget({ environmentId: id, label: "Mac" });
const broker = (id: EnvironmentId) =>
  new BrokerConnectionTarget({ environmentId: id, label: "Cloud", sessionId: "cloud:run-1" });

function harness(projects: ReadonlyArray<EnvironmentProject>, catalog: EnvironmentCatalogState) {
  const atoms = createCloudAdoptionAtoms({
    catalogValueAtom: Atom.make(catalog),
    projectsAtom: Atom.make(projects),
  });
  const registry = AtomRegistry.make();
  return { atoms, registry };
}

describe("cloud adoption on the phone (#999)", () => {
  it("joins the machine's checkout with the selected project's title and Jira link", () => {
    const { atoms, registry } = harness(
      [selected, checkout],
      catalogOf([DESKTOP, relay], [MACHINE, broker]),
    );
    const adopted = registry.get(atoms.adoptedProjectsAtom);
    expect(adopted).toHaveLength(2);
    expect(adopted[0]).toBe(selected);
    expect(adopted[1]).toMatchObject({
      environmentId: MACHINE,
      id: "checkout",
      title: "Nexi AI",
      source: jira,
      workspaceRoot: "/work/checkout",
      repositoryIdentity: checkout.repositoryIdentity,
    });
  });

  it("leaves the list unchanged without a broker environment", () => {
    const projects = [selected, project(DESKTOP, "other", "Other", null)];
    const { atoms, registry } = harness(projects, catalogOf([DESKTOP, relay]));
    expect(registry.get(atoms.adoptedProjectsAtom)).toBe(projects);
  });

  it("adopts nothing when the machine has no project of the selected repository", () => {
    const other = project(
      MACHINE,
      "other",
      "other-repo",
      "https://nexplore.ghe.com/hive/other.git",
    );
    const projects = [selected, other];
    const { atoms, registry } = harness(projects, catalogOf([DESKTOP, relay], [MACHINE, broker]));
    expect(registry.get(atoms.adoptedProjectsAtom)).toBe(projects);
  });

  it("lists the machine's scratch project without adopting it", () => {
    const scratch = project(MACHINE, "scratch", "Scratch", null, { isScratch: true });
    const { atoms, registry } = harness(
      [selected, scratch],
      catalogOf([DESKTOP, relay], [MACHINE, broker]),
    );
    const adopted = registry.get(atoms.adoptedProjectsAtom);
    expect(adopted).toHaveLength(2);
    expect(adopted[1]).toBe(scratch);
  });
});
