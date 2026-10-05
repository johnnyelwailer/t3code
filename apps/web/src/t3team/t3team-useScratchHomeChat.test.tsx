import type { ProjectShellProject } from "@t3tools/project-context";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const scratch = vi.hoisted(() => ({
  root: "/home/dev/.t3/scratch" as string | null,
  environmentId: "env-local" as string | null,
  open: vi.fn(),
}));

vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => "env-local" }));
vi.mock("~/hooks/useScratchProject", () => ({
  useScratchProject: () => ({
    scratchEnvironmentId: () => scratch.environmentId,
    scratchWorkspaceRootFor: () => scratch.root,
    openScratchProject: scratch.open,
  }),
}));

import { findScratchProject, useT3TeamScratchHomeChat } from "./t3team-useScratchHomeChat";

const project = (id: string, rootPath: string | undefined): ProjectShellProject =>
  ({
    id,
    title: id,
    source: { provider: "local" },
    ...(rootPath ? { workspace: { rootPath, createdAt: "2026-10-04T00:00:00.000Z" } } : {}),
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
  }) as never;

function renderHome(projects: ReadonlyArray<ProjectShellProject>) {
  let result!: ReturnType<typeof useT3TeamScratchHomeChat>;
  function Probe() {
    result = useT3TeamScratchHomeChat(projects);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return result;
}

beforeEach(() => {
  scratch.root = "/home/dev/.t3/scratch";
  scratch.environmentId = "env-local";
  scratch.open.mockReset();
});

describe("findScratchProject", () => {
  it("finds the store project on the environment's Scratch folder", () => {
    const projects = [project("repo", "/work/repo"), project("scratch", "/home/dev/.t3/scratch/")];
    expect(findScratchProject(projects, "/home/dev/.t3/scratch")?.id).toBe("scratch");
    expect(findScratchProject(projects, null)).toBeNull();
    expect(findScratchProject([project("repo", "/work/repo")], "/home/dev/.t3/scratch")).toBe(null);
  });
});

describe("useT3TeamScratchHomeChat", () => {
  it("chats in the existing Scratch project and offers no create", () => {
    const home = renderHome([project("scratch", "/home/dev/.t3/scratch")]);
    expect(home.scratchProject?.id).toBe("scratch");
    expect(home.startScratch).toBeUndefined();
  });

  it("offers to create the Scratch project on the environment that has one", () => {
    const home = renderHome([project("repo", "/work/repo")]);
    expect(home.scratchProject).toBeNull();
    home.startScratch?.();
    expect(scratch.open).toHaveBeenCalledWith("env-local");
  });

  it("offers nothing when no connected environment has a Scratch folder", () => {
    scratch.environmentId = null;
    scratch.root = null;
    const home = renderHome([]);
    expect(home.scratchProject).toBeNull();
    expect(home.startScratch).toBeUndefined();
  });
});
