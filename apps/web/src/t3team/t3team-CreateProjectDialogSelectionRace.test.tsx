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
 * Reproduces the wizard-binding invariant bug: a background project-list refresh that resolves
 * WHILE the user is clicking a row must never (a) clobber a selection the click just made, or
 * (b) yank the step backwards out of one the user already reached. See the fix in
 * hooks/t3team-useCreateProject.ts (selection tracked by id), hooks/t3team-useCreateProjectAccountLoaders.ts
 * and hooks/t3team-useCreateProjectLoadPersisted.ts (forward-only writes).
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

// The profile/repositories/creating steps pull in setup-profile cards, repo discovery and pack
// atoms that need a live Atom registry provider this test does not set up. Reaching "profile" here
// is only about proving the wizard doesn't get yanked out of it — the step bodies' own contents
// are irrelevant.
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

vi.mock("~/t3team/t3team-mock-adapter", () => ({
  t3teamCreateProject: (input: unknown) => mockT3teamCreateProject(input),
}));

vi.mock("~/t3team/hooks/t3team-createProjectFinalization", () => ({
  finalizeCreatedProject: (input: unknown) => mockFinalizeCreatedProject(input),
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

// Fresh object identities standing in for the network response: an extra project inserted at
// index 0 (so list order differs from the cached list), and a revalidated IES object carrying a
// marker the cached copy never had — proof that a survived selection re-reads the CURRENT list
// rather than holding on to the stale row the user actually clicked.
const extraProject: ExternalProject = { id: "0", provider: "atlassian", title: "Extra Project" };
const nexiAiRevalidated: ExternalProject = {
  id: "1",
  provider: "atlassian",
  title: "Nexi AI",
  key: "NEXI",
};
const iesSandboxRevalidated: ExternalProject = {
  id: "2",
  provider: "atlassian",
  title: "IES - Sandbox (Scrum)",
  key: "IES",
  raw: { projectTypeKey: "software-v2" },
};
const revalidatedProjects = [extraProject, nexiAiRevalidated, iesSandboxRevalidated];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function findButtonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`button with text "${text}" not found`);
  return button;
}

async function mountWizard() {
  writeIntegrationCache("atlassian:listAccounts", [account]);
  writeIntegrationCache(`atlassian:listProjects:${account.provider}:${account.id}`, [
    nexiAi,
    iesSandbox,
  ]);

  const listProjectsDeferred = createDeferred<ReadonlyArray<ExternalProject>>();
  const baseBackend = createMockBackend();
  backendRef.current = {
    ...baseBackend,
    atlassian: {
      ...baseBackend.atlassian,
      listAccounts: vi.fn().mockResolvedValue([account]),
      listProjects: vi.fn().mockReturnValue(listProjectsDeferred.promise),
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
  // Let the bootstrap's real (non-deferred) listAccounts() resolve and reach the paused
  // listProjects() await, mirroring the live bug: the network fetch is in flight while the
  // cached-first render already put the project step on screen and interactive.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return { host, root, listProjectsDeferred, onCreated };
}

describe("CreateProjectDialog wizard-binding selection race", () => {
  beforeEach(() => {
    mockT3teamCreateProject.mockReset();
    mockFinalizeCreatedProject.mockReset();
    mockFinalizeCreatedProject.mockImplementation(async ({ project }) => project);
  });

  it("keeps a click-made selection through a background project-list swap and revalidates it", async () => {
    const { host, listProjectsDeferred } = await mountWizard();

    const iesButton = findButtonByText(host, "IES - Sandbox (Scrum)");
    await act(async () => {
      iesButton.click();
    });
    expect(iesButton.getAttribute("aria-pressed")).toBe("true");
    expect(findButtonByText(host, "Continue").disabled).toBe(false);

    await act(async () => {
      listProjectsDeferred.resolve(revalidatedProjects);
      await Promise.resolve();
      await Promise.resolve();
    });

    // (a) selection survives the list swap.
    const iesButtonAfterSwap = findButtonByText(host, "IES - Sandbox (Scrum)");
    expect(iesButtonAfterSwap.getAttribute("aria-pressed")).toBe("true");
    expect(findButtonByText(host, "Continue").disabled).toBe(false);

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

    mockT3teamCreateProject.mockReturnValue(
      Effect.succeed({
        id: "created-project-id",
        title: iesSandboxRevalidated.title,
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

    // (b) the revalidated object is used: the id resolves through the CURRENT list, not a
    // stale captured reference, proven by the marker only the new list object carries.
    expect(mockT3teamCreateProject).toHaveBeenCalledTimes(1);
    const [createInput] = mockT3teamCreateProject.mock.calls[0] as [Record<string, unknown>];
    expect(createInput.externalProjectId).toBe("2");
    expect((createInput.raw as Record<string, unknown>).projectTypeKey).toBe("software-v2");
  });

  it("does not yank the wizard step backward when the background load resolves late", async () => {
    const { host, listProjectsDeferred } = await mountWizard();

    await act(async () => {
      findButtonByText(host, "IES - Sandbox (Scrum)").click();
    });
    await act(async () => {
      findButtonByText(host, "Continue").click();
    });
    expect(host.textContent).toContain("profile-step");

    // (c) the late resolution must not move the step backward out of "profile".
    await act(async () => {
      listProjectsDeferred.resolve(revalidatedProjects);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain("profile-step");
  });
});
