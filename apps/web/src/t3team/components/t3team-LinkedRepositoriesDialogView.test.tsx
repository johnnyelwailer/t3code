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
    const markup = renderToStaticMarkup(view());
    expect(markup).toContain(LINKED_REPOSITORIES_HELP);
    expect(markup).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(markup).toContain("No repositories are linked yet.");
    expect(markup).not.toContain("Make main");
    expect(markup).not.toContain(">Main<");
  });

  it("marks the single linked repository as main", () => {
    const markup = renderToStaticMarkup(view({ linkedUrls: [ALPHA], mainRepositoryUrl: ALPHA }));
    expect(markup).toContain("acme/");
    expect(markup).toContain("alpha");
    expect(markup).toContain("is the main repository");
    expect(markup).toContain(">Main<");
    expect(markup).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(markup).not.toContain("Make main");
  });

  it("offers Make main on every non-main row when several repositories are linked", () => {
    const markup = renderToStaticMarkup(
      view({ linkedUrls: [ALPHA, BETA, GAMMA], mainRepositoryUrl: ALPHA }),
    );
    expect(markup).toContain("acme/alpha is the main repository");
    expect(markup).toContain("Make acme/beta the main repository");
    expect(markup).toContain("Make acme/gamma the main repository");
    expect(markup).toContain(">Main<");
    expect(markup).not.toContain("Make acme/alpha the main repository");
    expect(markup).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
  });

  it("shows the local-workspace message for an existing project with linked repos and no main", () => {
    const markup = renderToStaticMarkup(
      view({ linkedUrls: [ALPHA, BETA], mainRepositoryUrl: null }),
    );
    expect(markup).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(markup).toContain("Make acme/alpha the main repository");
    expect(markup).toContain("Make acme/beta the main repository");
  });

  it("shows the adopted-workspace message when the project workspace itself is main", () => {
    const markup = renderToStaticMarkup(
      view({ linkedUrls: [ALPHA], mainRepositoryUrl: null, adoptedWorkspace: true }),
    );
    expect(markup).toContain(ADOPTED_WORKSPACE_MESSAGE);
    expect(markup).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
  });

  it("shows Saving… on the new main row while the persist is pending", () => {
    const markup = renderToStaticMarkup(
      view({
        linkedUrls: [ALPHA, BETA],
        mainRepositoryUrl: BETA,
        pendingMainUrl: BETA,
        mainPending: true,
      }),
    );
    expect(markup).toContain("acme/beta is the main repository");
    expect(markup).toContain("Saving…");
    expect(markup).toContain("Make acme/alpha the main repository");
    expect(markup).not.toContain("Making main…");
    expect(markup).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
  });

  it("shows a plain error and Retry on the failed row, with the previous main restored", () => {
    const markup = renderToStaticMarkup(
      view({
        linkedUrls: [ALPHA, BETA],
        mainRepositoryUrl: ALPHA,
        mainError: { url: BETA, message: MAIN_REPOSITORY_PERSIST_ERROR },
        onRetryMain: () => {},
      }),
    );
    expect(markup).toContain("acme/alpha is the main repository");
    expect(markup).toContain("Make acme/beta the main repository");
    expect(markup).toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(markup).toContain(">Retry<");
    expect(markup).not.toContain("Saving…");
  });

  it("keeps the promoted main and shows Retry when an unlink persist fails", () => {
    const markup = renderToStaticMarkup(
      view({
        linkedUrls: [ALPHA, GAMMA],
        mainRepositoryUrl: ALPHA,
        mainError: { url: ALPHA, message: MAIN_REPOSITORY_PERSIST_ERROR },
        onRetryMain: () => {},
      }),
    );
    expect(markup).toContain("acme/alpha is the main repository");
    expect(markup).toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(markup).toContain(">Retry<");
  });

  it("shows a save error with Retry", () => {
    const markup = renderToStaticMarkup(
      view({
        linkedUrls: [ALPHA],
        mainRepositoryUrl: ALPHA,
        saveError: "network down",
        dirty: true,
      }),
    );
    expect(markup).toContain("network down");
    expect(markup).toContain(">Retry<");
    expect(markup).toContain("unsaved changes");
  });

  it("switches main with one click and, when the main repo is unlinked, makes the first remaining one main", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(createElement(Interactive, { initialUrls: [ALPHA, BETA, GAMMA], initialMain: BETA }));
    });
    click(container, "Make acme/gamma the main repository");
    expect(container.innerHTML).toContain("acme/gamma is the main repository");
    expect(container.innerHTML).toContain("Saving…");
    expect(container.innerHTML).not.toContain("acme/beta is the main repository");
    await flush();
    expect(container.innerHTML).toContain("acme/gamma is the main repository");
    expect(container.innerHTML).not.toContain("Saving…");

    click(container, "Unlink acme/gamma");
    // Option A: first remaining (alpha) becomes main and persists on its own.
    expect(container.innerHTML).toContain("acme/alpha is the main repository");
    expect(container.innerHTML).toContain("Saving…");
    await flush();
    expect(container.innerHTML).toContain("acme/alpha is the main repository");
    expect(container.innerHTML).not.toContain("acme/gamma is the main repository");
    expect(container.innerHTML).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(container.innerHTML).not.toContain("Saving…");
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
    expect(container.innerHTML).toContain("acme/beta is the main repository");
    expect(container.innerHTML).toContain("Saving…");
    await act(async () => {
      next!.reject(new Error("refused"));
      await Promise.resolve();
    });
    expect(container.innerHTML).toContain("acme/alpha is the main repository");
    expect(container.innerHTML).toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(container.innerHTML).toContain(">Retry<");
    expect(container.innerHTML).not.toContain("Saving…");
    expect(container.innerHTML).toContain("Make acme/beta the main repository");

    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
    expect(retry).toBeDefined();
    act(() => {
      retry!.click();
    });
    expect(container.innerHTML).toContain("acme/beta is the main repository");
    expect(container.innerHTML).toContain("Saving…");
    expect(container.innerHTML).not.toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    await act(async () => {
      next!.resolve();
      await Promise.resolve();
    });
    expect(container.innerHTML).toContain("acme/beta is the main repository");
    expect(container.innerHTML).not.toContain("Saving…");
    expect(container.innerHTML).not.toContain(MAIN_REPOSITORY_PERSIST_ERROR);
    expect(container.innerHTML).not.toContain("Make acme/beta the main repository");
  });

  it("shows the local-workspace message after the last linked repository is removed", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(createElement(Interactive, { initialUrls: [ALPHA], initialMain: ALPHA }));
    });
    click(container, "Unlink acme/alpha");
    expect(container.innerHTML).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    await flush();
    expect(container.innerHTML).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(container.innerHTML).toContain("No repositories are linked yet.");
  });
});
