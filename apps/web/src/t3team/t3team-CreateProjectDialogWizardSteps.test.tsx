// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import * as Effect from "effect/Effect";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";

import { createLucideReactMock } from "./t3team-createLucideReactMock";
import { createMockBackend } from "./backend/t3team-mockBackend";
import type { BackendApi } from "./backend/t3team-types";
import { writeIntegrationCache } from "./hooks/t3team-integrationCache";
import { CreateProjectDialog } from "./t3team-CreateProjectDialog";

/**
 * The final wizard step used to be a single "confirm" screen overloaded with a profile grid, a
 * "Clone starter profile" escape hatch, a setup preview, and repository linking, all ending in one
 * "Add project" button. It is now three steps — profile, repositories (explicitly optional),
 * review — and this test drives the REAL footer through all of them, proving: Continue reaches
 * each step in order, "Skip" on the repositories step reaches review leaving zero repos linked, the
 * review step's heading (real, unmocked) names the selected project, and creation still resolves
 * the correct external project id with an empty linked-repositories list.
 */

const { mockT3teamCreateProject, mockFinalizeCreatedProject } = vi.hoisted(() => ({
  mockT3teamCreateProject: vi.fn(),
  mockFinalizeCreatedProject: vi.fn(),
}));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => backendRef.current,
}));

vi.mock("~/t3team/components/ui/t3team-input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("~/t3team/components/ui/t3team-scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("~/t3team/t3team-projectSetupProfile", () => ({
  useT3TeamProjectSetupProfile: () => "product-partner",
  writeT3TeamProjectSetupProfile: () => undefined,
  readT3TeamProjectSetupProfile: () => "product-partner",
}));

// Profile and repositories pull in pack atoms / GitHub discovery hooks that need a live Atom
// registry this test does not set up; only the step transitions matter here. CreatingStep needs
// the same pack atoms, so it is stubbed too, but ConfirmStepHeading is left REAL (via
// importOriginal) so the review-step heading assertion below means something.
vi.mock("~/t3team/t3team-CreateProjectDialogConfirmStep", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./t3team-CreateProjectDialogConfirmStep")>();
  return { ...actual, CreatingStep: () => <div>creating-step</div> };
});
vi.mock("~/t3team/t3team-CreateProjectDialogProfileStep", () => ({
  ProfileStep: () => <div>profile-step</div>,
}));
vi.mock("~/t3team/t3team-CreateProjectRepositorySection", () => ({
  RepositoriesStep: () => <div>repositories-step</div>,
}));
vi.mock("~/t3team/t3team-CreateProjectDialogReviewStep", () => ({
  ReviewStep: () => <div>review-step</div>,
}));

vi.mock("~/t3team/t3team-mock-adapter", () => ({
  t3teamCreateProject: (input: unknown) => mockT3teamCreateProject(input),
}));

vi.mock("~/t3team/hooks/t3team-createProjectFinalization", () => ({
  finalizeCreatedProject: (input: unknown) => mockFinalizeCreatedProject(input),
}));

const backendRef: { current: BackendApi | null } = { current: null };

const account: IntegrationAccount = { id: "acct-1", provider: "atlassian", label: "Acme Co" };
const iesSandbox: ExternalProject = {
  id: "2",
  provider: "atlassian",
  title: "IES - Sandbox (Scrum)",
  key: "IES",
};

function findButtonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`button with text "${text}" not found`);
  return button;
}

async function mountWizard() {
  writeIntegrationCache("atlassian:listAccounts", [account]);
  writeIntegrationCache(`atlassian:listProjects:${account.provider}:${account.id}`, [iesSandbox]);

  const baseBackend = createMockBackend();
  backendRef.current = {
    ...baseBackend,
    atlassian: {
      ...baseBackend.atlassian,
      listAccounts: vi.fn().mockResolvedValue([account]),
      listProjects: vi.fn().mockResolvedValue([iesSandbox]),
    },
  };

  const host = document.createElement("div");
  const root = createRoot(host);
  const onCreated = vi.fn();

  await act(async () => {
    root.render(
      <CreateProjectDialog onClose={() => undefined} onCreated={onCreated} variant="dialog" />,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return { host, onCreated };
}

describe("CreateProjectDialog split final step", () => {
  beforeEach(() => {
    mockT3teamCreateProject.mockReset();
    mockFinalizeCreatedProject.mockReset();
    mockFinalizeCreatedProject.mockImplementation(async ({ project }) => project);
  });

  it("walks project -> profile -> repositories -> (skip) -> review and creates with zero repos", async () => {
    const { host } = await mountWizard();

    await act(async () => {
      findButtonByText(host, "IES - Sandbox (Scrum)").click();
    });
    await act(async () => {
      findButtonByText(host, "Continue").click(); // project -> profile
    });
    expect(host.textContent).toContain("profile-step");

    await act(async () => {
      findButtonByText(host, "Continue").click(); // profile -> repositories
    });
    expect(host.textContent).toContain("repositories-step");

    await act(async () => {
      findButtonByText(host, "Skip").click(); // repositories -> review, no repos linked
    });
    expect(host.textContent).toContain("review-step");

    // The review step's heading (real ConfirmStepHeading) names the selected project.
    expect(host.textContent).toContain("IES - Sandbox (Scrum)");
    expect(host.textContent).toContain("IES");

    mockT3teamCreateProject.mockReturnValue(
      Effect.succeed({
        id: "created-project-id",
        title: iesSandbox.title,
        source: { provider: "atlassian" },
        workspace: { rootPath: "/tmp/ies-sandbox", createdAt: "2026-07-27T00:00:00.000Z" },
        createdAt: "2026-07-27T00:00:00.000Z",
        updatedAt: "2026-07-27T00:00:00.000Z",
      }),
    );
    await act(async () => {
      findButtonByText(host, "Add project").click();
      await Promise.resolve();
    });

    expect(mockT3teamCreateProject).toHaveBeenCalledTimes(1);
    const [createInput] = mockT3teamCreateProject.mock.calls[0] as [Record<string, unknown>];
    expect(createInput.externalProjectId).toBe("2");
    const raw = createInput.raw as { agentReferences: { linkedRepositories: unknown[] } };
    expect(raw.agentReferences.linkedRepositories).toEqual([]);
  });
});
