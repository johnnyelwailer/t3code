// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";

import { createLucideReactMock } from "./t3team-createLucideReactMock";
import { createMockBackend } from "./backend/t3team-mockBackend";
import type { BackendApi } from "./backend/t3team-types";
import { writeIntegrationCache } from "./hooks/t3team-integrationCache";
import { CreateProjectDialog } from "./t3team-CreateProjectDialog";

/**
 * Defect 3: a project already bound to an external (Jira) project must be flagged at SELECTION
 * time in the wizard, not surfaced as a raw invariant string after the user walks the whole flow.
 * See `hooks/t3team-useExistingProjectForExternalProject.ts` and
 * `hooks/t3team-useCreateProjectAlreadyAdded.ts`.
 */

const { mockUseProjects } = vi.hoisted(() => ({ mockUseProjects: vi.fn() }));

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => backendRef.current,
}));

vi.mock("~/state/entities", () => ({
  useProjects: () => mockUseProjects(),
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

vi.mock("~/t3team/t3team-CreateProjectDialogConfirmStep", () => ({
  ConfirmStepHeading: () => <div>confirm-step-heading</div>,
  CreatingStep: () => <div>creating-step</div>,
}));
vi.mock("~/t3team/t3team-CreateProjectDialogProfileStep", () => ({
  ProfileStep: () => <div>profile-step</div>,
}));
vi.mock("~/t3team/t3team-CreateProjectRepositorySection", () => ({
  RepositoriesStep: () => <div>repositories-step</div>,
}));
vi.mock("~/t3team/t3team-CreateProjectDialogReviewStep", () => ({
  ReviewStep: () => <div>review-step</div>,
}));

const backendRef: { current: BackendApi | null } = { current: null };

const account: IntegrationAccount = { id: "acct-1", provider: "atlassian", label: "Acme Co" };
const nexiAi: ExternalProject = { id: "1", provider: "atlassian", title: "Nexi AI", key: "NEXI" };
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

async function mountWizard(onOpenExistingProject: (projectId: string) => void) {
  writeIntegrationCache("atlassian:listAccounts", [account]);
  writeIntegrationCache(`atlassian:listProjects:${account.provider}:${account.id}`, [
    nexiAi,
    iesSandbox,
  ]);

  const baseBackend = createMockBackend();
  backendRef.current = {
    ...baseBackend,
    atlassian: {
      ...baseBackend.atlassian,
      listAccounts: vi.fn().mockResolvedValue([account]),
      listProjects: vi.fn().mockResolvedValue([nexiAi, iesSandbox]),
    },
  };

  const host = document.createElement("div");
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <CreateProjectDialog
        onClose={() => undefined}
        onCreated={() => undefined}
        onOpenExistingProject={onOpenExistingProject}
        variant="dialog"
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return { host, root };
}

describe("CreateProjectDialog already-added detection", () => {
  it("shows an Already added badge and opens the existing project instead of advancing", async () => {
    mockUseProjects.mockReturnValue([
      {
        id: "existing-ies-project",
        title: "IES - Sandbox (Scrum)",
        environmentId: "env-1",
        source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "2" },
      },
    ]);
    const onOpenExistingProject = vi.fn();
    const { host } = await mountWizard(onOpenExistingProject);

    const iesButton = findButtonByText(host, "IES - Sandbox (Scrum)");
    expect(iesButton.textContent).toContain("Already added");
    expect(iesButton.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      iesButton.click();
    });

    expect(onOpenExistingProject).toHaveBeenCalledWith("existing-ies-project");
    expect(iesButton.getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).not.toContain("confirm-step");
  });

  it("still advances a normal (not already-added) row through to profile", async () => {
    mockUseProjects.mockReturnValue([]);
    const onOpenExistingProject = vi.fn();
    const { host } = await mountWizard(onOpenExistingProject);

    const nexiButton = findButtonByText(host, "Nexi AI");
    expect(nexiButton.textContent).not.toContain("Already added");

    await act(async () => {
      nexiButton.click();
    });
    expect(nexiButton.getAttribute("aria-pressed")).toBe("true");
    expect(onOpenExistingProject).not.toHaveBeenCalled();

    await act(async () => {
      findButtonByText(host, "Continue").click();
    });
    expect(host.textContent).toContain("profile-step");
  });
});
