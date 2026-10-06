// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CreateProjectChooseStep } from "./t3team-CreateProjectChooseStep";
import { CreateProjectSetupStep } from "./t3team-CreateProjectSetupStep";
import { JiraProjectDialogShell } from "./t3team-JiraProjectDialogShell";
import {
  chooseProps,
  catalogState,
  repositoryCatalog,
  setupProps,
} from "./stories/t3team-createProjectStoryFixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function show(node: ReactNode, onClose: () => void = () => {}, dismissible = true) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <JiraProjectDialogShell onClose={onClose} dismissible={dismissible}>
        {node}
      </JiraProjectDialogShell>,
    );
  });
}

const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.trim().startsWith(text),
  );

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("add-project dialog, set-up screen", () => {
  it("names the project and offers Add project and Change project", () => {
    const onCreate = vi.fn();
    const onBack = vi.fn();
    show(createElement(CreateProjectSetupStep, setupProps({ onCreate, onBack })));

    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("IES NG");
    act(() => buttonByText("Add project")!.click());
    act(() => buttonByText("Change project")!.click());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("links a repository with one click on its row", () => {
    const onToggleRepository = vi.fn();
    show(createElement(CreateProjectSetupStep, setupProps({ onToggleRepository })));

    const row = document.querySelector<HTMLButtonElement>('[role="checkbox"]')!;
    act(() => row.click());
    expect(onToggleRepository).toHaveBeenCalledTimes(1);
    expect(repositoryCatalog.map((repo) => repo.url)).toContain(
      onToggleRepository.mock.calls[0]![0],
    );
  });

  it("counts what is linked", () => {
    show(
      createElement(
        CreateProjectSetupStep,
        setupProps({ linkedRepositoryUrls: [repositoryCatalog[5]!.url] }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("1 linked");
  });

  it("locks the form while the project is being created", () => {
    show(
      createElement(CreateProjectSetupStep, setupProps({ submitState: { kind: "creating" } })),
      undefined,
      false,
    );

    const add = buttonByText("Adding")!;
    expect(add.disabled).toBe(true);
    expect(buttonByText("Change project")!.disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
      "keep this window open",
    );
  });

  it("keeps the form and offers a retry after a failure", () => {
    show(
      createElement(
        CreateProjectSetupStep,
        setupProps({
          linkedRepositoryUrls: [repositoryCatalog[5]!.url],
          submitState: { kind: "error", error: new Error("boom") },
        }),
      ),
    );

    expect(buttonByText("Try again")!.disabled).toBe(false);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("1 linked");
  });

  it("does not let Esc close the dialog while creating", () => {
    const onClose = vi.fn();
    show(
      createElement(CreateProjectSetupStep, setupProps({ submitState: { kind: "creating" } })),
      onClose,
      false,
    );
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Esc when idle", () => {
    const onClose = vi.fn();
    show(createElement(CreateProjectSetupStep, setupProps()), onClose);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("add-project dialog, choose screen", () => {
  it("shows the connect panel instead of a list when no site is connected", () => {
    show(
      createElement(
        CreateProjectChooseStep,
        chooseProps({
          catalogState: catalogState({ catalog: [], connected: false }),
          connectPanel: createElement("div", null, "connect-panel"),
        }),
      ),
    );
    const text = document.querySelector('[role="dialog"]')!.textContent;
    expect(text).toContain("connect-panel");
    expect(text).toContain("Connect Jira to choose a project.");
    expect(document.querySelector("input")).toBeNull();
  });

  it("keeps showing cached projects even when a refresh says disconnected", () => {
    show(
      createElement(
        CreateProjectChooseStep,
        chooseProps({
          catalogState: catalogState({ connected: false }),
          connectPanel: createElement("div", null, "connect-panel"),
        }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain("connect-panel");
  });

  it("explains a deep link to a project that is gone", () => {
    show(
      createElement(
        CreateProjectChooseStep,
        chooseProps({ notice: "That project is no longer available — pick another." }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("no longer available");
  });
});
