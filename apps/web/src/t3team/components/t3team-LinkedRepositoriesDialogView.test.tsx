/* oxlint-disable t3code/no-dom-test-environment -- Click, pending, and retry checks need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Same as above: unit-file click tests use createRoot; the disposable helper is for *.browser.test.tsx. */
import { act, createElement, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveMainRepositoryUrl } from "~/t3team/hooks/t3team-linkedRepositoryMainSelection";
import {
  beginMainPersist,
  completeMainPersist,
  failMainPersist,
  initialMainOptimisticState,
  MAIN_REPOSITORY_PERSIST_ERROR,
  type MainRepositoryOptimisticState,
} from "~/t3team/hooks/t3team-mainRepositoryOptimistic";
import {
  ADOPTED_WORKSPACE_MESSAGE,
  LINKED_REPOSITORIES_HELP,
  NO_MAIN_REPOSITORY_MESSAGE,
} from "~/t3team/components/t3team-LinkedRepositoriesHelp";
import { LinkedRepositoriesDialogView } from "~/t3team/components/t3team-LinkedRepositoriesDialogView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("~/t3team/components/ui/t3team-button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("~/t3team/components/ui/t3team-card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
}));

vi.mock("~/t3team/components/error/t3team-ErrorState", () => ({
  T3TeamErrorState: ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
    <div>
      <span>{String(error)}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  ),
}));

const ALPHA = "https://github.com/acme/alpha";
const BETA = "https://github.com/acme/beta";
const GAMMA = "https://github.com/acme/gamma";

function view(props: Partial<React.ComponentProps<typeof LinkedRepositoriesDialogView>> = {}) {
  return (
    <LinkedRepositoriesDialogView
      projectTitle="Project Alpha"
      linkedUrls={[]}
      mainRepositoryUrl={null}
      onMakeMain={() => {}}
      onUnlink={() => {}}
      onClose={() => {}}
      onSave={() => {}}
      {...props}
    />
  );
}

function Interactive({
  initialUrls,
  initialMain,
  persist,
}: {
  initialUrls: ReadonlyArray<string>;
  initialMain: string | null;
  persist?: (url: string | null) => Promise<void>;
}): ReactElement {
  const [linkedUrls, setLinkedUrls] = useState(initialUrls);
  const [state, setState] = useState<MainRepositoryOptimisticState>(() =>
    initialMainOptimisticState(initialMain),
  );
  const runPersist = (nextUrl: string | null, revertOnFailure: boolean) => {
    setState((current) => beginMainPersist(current, nextUrl, revertOnFailure));
    void (persist ?? (async () => undefined))(nextUrl).then(
      () => setState((current) => completeMainPersist(current, nextUrl)),
      () => setState((current) => failMainPersist(current)),
    );
  };
  const retry = () => {
    if (!state.error) return;
    runPersist(state.error.url, state.revertOnFailure);
  };
  return (
    <LinkedRepositoriesDialogView
      projectTitle="Project Alpha"
      linkedUrls={linkedUrls}
      mainRepositoryUrl={state.mainUrl}
      dirty
      pendingMainUrl={state.pendingUrl}
      mainPending={state.pendingUrl !== undefined}
      mainError={state.error}
      onMakeMain={(url) => runPersist(url, true)}
      onRetryMain={retry}
      onUnlink={(url) => {
        const next = linkedUrls.filter((entry) => entry !== url);
        const newMain = resolveMainRepositoryUrl({
          linkedUrls: next,
          currentMain: state.mainUrl,
          previousLinkedUrls: linkedUrls,
        });
        setLinkedUrls(next);
        if (newMain === state.mainUrl) return;
        const previousStillLinked =
          state.committedUrl !== null && next.includes(state.committedUrl);
        runPersist(newMain, previousStillLinked);
      }}
      onClose={() => {}}
      onSave={() => {}}
    />
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Render to a DOM so assertions can use text and aria-label, not raw HTML entities. */
function mount(element: ReactElement): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(element);
  return container;
}

function textOf(container: HTMLElement): string {
  return container.textContent ?? "";
}

function byAriaLabel(container: HTMLElement, name: string): Element | undefined {
  return [...container.querySelectorAll("[aria-label]")].find(
    (entry) => entry.getAttribute("aria-label") === name,
  );
}

function click(container: HTMLElement, ariaLabel: string) {
  const button = [...container.querySelectorAll("button")].find(
    (entry) => entry.getAttribute("aria-label") === ariaLabel,
  );
  expect(button).toBeDefined();
  act(() => {
    button!.click();
  });
}

describe("LinkedRepositoriesDialogView", () => {
  it("shows help and a local-workspace message when no repository is linked", () => {
    const container = mount(view());
    expect(textOf(container)).toContain(LINKED_REPOSITORIES_HELP);
    expect(textOf(container)).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(textOf(container)).toContain("No repositories are linked yet.");
    expect(textOf(container)).not.toContain("Make main");
    expect(textOf(container)).not.toContain("Main");
  });

  it("marks the single linked repository as main", () => {
    const container = mount(view({ linkedUrls: [ALPHA], mainRepositoryUrl: ALPHA }));
    expect(textOf(container)).toContain("acme/");
    expect(textOf(container)).toContain("alpha");
    expect(byAriaLabel(container, "acme/alpha is the main repository")).toBeDefined();
    expect(textOf(container)).toContain("Main");
    expect(textOf(container)).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(textOf(container)).not.toContain("Make main");
  });

  it("offers Make main on every non-main row when several repositories are linked", () => {
    const container = mount(view({ linkedUrls: [ALPHA, BETA, GAMMA], mainRepositoryUrl: ALPHA }));
    expect(byAriaLabel(container, "acme/alpha is the main repository")).toBeDefined();
    expect(byAriaLabel(container, "Make acme/beta the main repository")).toBeDefined();
    expect(byAriaLabel(container, "Make acme/gamma the main repository")).toBeDefined();
    expect(textOf(container)).toContain("Main");
    expect(byAriaLabel(container, "Make acme/alpha the main repository")).toBeUndefined();
    expect(textOf(container)).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
  });

  it("shows the local-workspace message for an existing project with linked repos and no main", () => {
    const container = mount(view({ linkedUrls: [ALPHA, BETA], mainRepositoryUrl: null }));
    expect(textOf(container)).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(byAriaLabel(container, "Make acme/alpha the main repository")).toBeDefined();
    expect(byAriaLabel(container, "Make acme/beta the main repository")).toBeDefined();
  });

  it("shows the adopted-workspace message when the project workspace itself is main", () => {
    const container = mount(
      view({ linkedUrls: [ALPHA], mainRepositoryUrl: null, adoptedWorkspace: true }),
    );
    expect(textOf(container)).toContain(ADOPTED_WORKSPACE_MESSAGE);
    expect(textOf(container)).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
  });

  it("shows Saving… on the new main row while the persist is pending", () => {
    const container = mount(
      view({
        linkedUrls: [ALPHA, BETA],
        mainRepositoryUrl: BETA,
        pendingMainUrl: BETA,
        mainPending: true,
      }),
    );
    expect(byAriaLabel(container, "acme/beta is the main repository")).toBeDefined();
    expect(textOf(container)).toContain("Saving…");
    expect(byAriaLabel(container, "Make acme/alpha the main repository")).toBeDefined();
    expect(textOf(container)).not.toContain("Making main…");
    expect(textOf(container)).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
  });

  it("shows a plain error and Retry on the failed row, with the previous main restored", () => {
    const container = mount(
      view({
        linkedUrls: [ALPHA, BETA],
        mainRepositoryUrl: ALPHA,
        mainError: { url: BETA, message: MAIN_REPOSITORY_PERSIST_ERROR },
        onRetryMain: () => {},
      }),
    );
    expect(byAriaLabel(container, "acme/alpha is the main repository")).toBeDefined();
    expect(byAriaLabel(container, "Make acme/beta the main repository")).toBeDefined();
    expect(textOf(container)).toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(textOf(container)).toContain("Retry");
    expect(textOf(container)).not.toContain("Saving…");
  });

  it("keeps the promoted main and shows Retry when an unlink persist fails", () => {
    const container = mount(
      view({
        linkedUrls: [ALPHA, GAMMA],
        mainRepositoryUrl: ALPHA,
        mainError: { url: ALPHA, message: MAIN_REPOSITORY_PERSIST_ERROR },
        onRetryMain: () => {},
      }),
    );
    expect(byAriaLabel(container, "acme/alpha is the main repository")).toBeDefined();
    expect(textOf(container)).toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(textOf(container)).toContain("Retry");
  });

  it("shows a save error with Retry", () => {
    const container = mount(
      view({
        linkedUrls: [ALPHA],
        mainRepositoryUrl: ALPHA,
        saveError: "network down",
        dirty: true,
      }),
    );
    expect(textOf(container)).toContain("network down");
    expect(textOf(container)).toContain("Retry");
    expect(textOf(container)).toContain("unsaved changes");
  });

  it("switches main with one click and, when the main repo is unlinked, makes the first remaining one main", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(Interactive, { initialUrls: [ALPHA, BETA, GAMMA], initialMain: BETA }),
      );
    });
    click(container, "Make acme/gamma the main repository");
    expect(byAriaLabel(container, "acme/gamma is the main repository")).toBeDefined();
    expect(textOf(container)).toContain("Saving…");
    expect(byAriaLabel(container, "acme/beta is the main repository")).toBeUndefined();
    await flush();
    expect(byAriaLabel(container, "acme/gamma is the main repository")).toBeDefined();
    expect(textOf(container)).not.toContain("Saving…");

    click(container, "Unlink acme/gamma");
    // Option A: first remaining (alpha) becomes main and persists on its own.
    expect(byAriaLabel(container, "acme/alpha is the main repository")).toBeDefined();
    expect(textOf(container)).toContain("Saving…");
    await flush();
    expect(byAriaLabel(container, "acme/alpha is the main repository")).toBeDefined();
    expect(byAriaLabel(container, "acme/gamma is the main repository")).toBeUndefined();
    expect(textOf(container)).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(textOf(container)).not.toContain("Saving…");
  });

  it("reverts to the previous main on failure and retries from the same row", async () => {
    let next: { resolve: () => void; reject: (error: Error) => void } | undefined;
    const persist = () =>
      new Promise<void>((resolve, reject) => {
        next = { resolve, reject };
      });
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(Interactive, {
          initialUrls: [ALPHA, BETA],
          initialMain: ALPHA,
          persist,
        }),
      );
    });
    click(container, "Make acme/beta the main repository");
    expect(byAriaLabel(container, "acme/beta is the main repository")).toBeDefined();
    expect(textOf(container)).toContain("Saving…");
    await act(async () => {
      next!.reject(new Error("refused"));
      await Promise.resolve();
    });
    expect(byAriaLabel(container, "acme/alpha is the main repository")).toBeDefined();
    expect(textOf(container)).toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(textOf(container)).toContain("Retry");
    expect(textOf(container)).not.toContain("Saving…");
    expect(byAriaLabel(container, "Make acme/beta the main repository")).toBeDefined();

    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    );
    expect(retry).toBeDefined();
    act(() => {
      retry!.click();
    });
    expect(byAriaLabel(container, "acme/beta is the main repository")).toBeDefined();
    expect(textOf(container)).toContain("Saving…");
    expect(textOf(container)).not.toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    await act(async () => {
      next!.resolve();
      await Promise.resolve();
    });
    expect(byAriaLabel(container, "acme/beta is the main repository")).toBeDefined();
    expect(textOf(container)).not.toContain("Saving…");
    expect(textOf(container)).not.toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(byAriaLabel(container, "Make acme/beta the main repository")).toBeUndefined();
  });

  it("shows the local-workspace message after the last linked repository is removed", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(createElement(Interactive, { initialUrls: [ALPHA], initialMain: ALPHA }));
    });
    click(container, "Unlink acme/alpha");
    expect(textOf(container)).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    await flush();
    expect(textOf(container)).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(textOf(container)).toContain("No repositories are linked yet.");
  });
});
