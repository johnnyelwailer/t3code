// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CreateProjectChooseStep } from "./t3team-CreateProjectChooseStep";
import { CreateProjectPage } from "./t3team-CreateProjectPage";
import { CreateProjectSetupFooter } from "./t3team-CreateProjectSetupFooter";
import { CreateProjectSetupStep } from "./t3team-CreateProjectSetupStep";
import {
  chooseProps,
  catalogState,
  repositoryCatalog,
  setupEntry,
  setupProps,
} from "./stories/t3team-createProjectStoryFixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function show(
  node: ReactNode,
  options: {
    onClose?: () => void;
    dismissible?: boolean;
    entry?: typeof setupEntry | null;
    footer?: ReactNode;
  } = {},
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <CreateProjectPage
        entry={options.entry ?? null}
        onClose={options.onClose ?? (() => {})}
        dismissible={options.dismissible ?? true}
        {...(options.footer ? { footer: options.footer } : {})}
      >
        {node}
      </CreateProjectPage>,
    );
  });
}

function showSetupScreen({
  onClose = () => {},
  creating = false,
  error = null as unknown,
  onCreate = () => {},
  onBack = () => {},
  onToggleRepository = () => {},
}: {
  onClose?: () => void;
  creating?: boolean;
  error?: unknown;
  onCreate?: () => void;
  onBack?: () => void;
  onToggleRepository?: (url: string) => void;
} = {}) {
  show(createElement(CreateProjectSetupStep, setupProps({ onToggleRepository })), {
    onClose,
    entry: setupEntry,
    dismissible: !creating,
    footer: createElement(CreateProjectSetupFooter, {
      projectTitle: setupEntry.title,
      creating,
      error,
      onBack,
      onCreate,
    }),
  });
}

const page = () => document.querySelector('[data-testid="create-project-page"]')!;

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

describe("add-project page, set-up screen", () => {
  it("names the project and offers Add project and Change project", () => {
    const onCreate = vi.fn();
    const onBack = vi.fn();
    showSetupScreen({ onCreate, onBack });

    expect(page().textContent).toContain("IES NG");
    act(() => buttonByText("Add project")!.click());
    act(() => buttonByText("Change project")!.click());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("links a repository with one click on its row", () => {
    const onToggleRepository = vi.fn();
    showSetupScreen({ onToggleRepository });

    const row = document.querySelector<HTMLButtonElement>('[role="checkbox"]')!;
    act(() => row.click());
    expect(onToggleRepository).toHaveBeenCalledTimes(1);
    expect(repositoryCatalog.map((repo) => repo.url)).toContain(
      onToggleRepository.mock.calls[0]![0],
    );
  });

  it("locks the form while the project is being created", () => {
    showSetupScreen({ creating: true });

    const add = buttonByText("Adding")!;
    expect(add.disabled).toBe(true);
    expect(buttonByText("Change project")!.disabled).toBe(true);
  });

  it("keeps the form and offers a retry after a failure", () => {
    showSetupScreen({ error: new Error("boom") });

    expect(buttonByText("Try again")!.disabled).toBe(false);
    expect(page().textContent).toContain("Couldn't add IES NG");
  });

  it("does not let Esc close the page while creating", () => {
    const onClose = vi.fn();
    showSetupScreen({ creating: true, onClose });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Esc when idle", () => {
    const onClose = vi.fn();
    showSetupScreen({ onClose });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("add-project page, choose screen", () => {
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
    expect(page().textContent).toContain("connect-panel");
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
    expect(page().textContent).not.toContain("connect-panel");
  });

  it("explains a deep link to a project that is gone", () => {
    show(
      createElement(
        CreateProjectChooseStep,
        chooseProps({ notice: "That project is no longer available — pick another." }),
      ),
    );
    expect(page().textContent).toContain("no longer available");
  });

  it("flags a site that failed to load without hiding the rest of the catalog", () => {
    show(
      createElement(
        CreateProjectChooseStep,
        chooseProps({
          catalogState: catalogState({
            siteFailures: [
              {
                accountId: "site-acme",
                provider: "atlassian",
                siteHost: "acme.atlassian.net",
                label: "acme.atlassian.net",
                error: "timeout",
              },
            ],
          }),
        }),
      ),
    );
    expect(page().textContent).toContain("Couldn't load acme.atlassian.net");
    expect(page().textContent).toContain("IES NG");
  });
});
