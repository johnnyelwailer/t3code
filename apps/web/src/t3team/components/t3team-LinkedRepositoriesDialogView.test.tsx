import { act, createElement, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveMainRepositoryUrl } from "~/t3team/hooks/t3team-linkedRepositoryMainSelection";
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
}: {
  initialUrls: ReadonlyArray<string>;
  initialMain: string | null;
}): ReactElement {
  const [linkedUrls, setLinkedUrls] = useState(initialUrls);
  const [main, setMain] = useState(initialMain);
  return (
    <LinkedRepositoriesDialogView
      projectTitle="Project Alpha"
      linkedUrls={linkedUrls}
      mainRepositoryUrl={main}
      dirty
      onMakeMain={(url) => setMain(url)}
      onUnlink={(url) => {
        const next = linkedUrls.filter((entry) => entry !== url);
        setMain(
          resolveMainRepositoryUrl({
            linkedUrls: next,
            currentMain: main,
            previousLinkedUrls: linkedUrls,
          }),
        );
        setLinkedUrls(next);
      }}
      onClose={() => {}}
      onSave={() => {}}
    />
  );
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

  it("shows a pending Make main label and an inline error with Retry", () => {
    const markup = renderToStaticMarkup(
      view({
        linkedUrls: [ALPHA, BETA],
        mainRepositoryUrl: ALPHA,
        pendingMainUrl: BETA,
        mainError: { url: BETA, message: "Could not switch the main repository." },
        onRetryMain: () => {},
      }),
    );
    expect(markup).toContain("Making main…");
    expect(markup).toContain("Could not switch the main repository.");
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

  it("switches main with one click and, when the main repo is unlinked, makes the first remaining one main", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(createElement(Interactive, { initialUrls: [ALPHA, BETA, GAMMA], initialMain: BETA }));
    });
    const makeGamma = [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Make acme/gamma the main repository",
    );
    expect(makeGamma).toBeDefined();
    act(() => {
      makeGamma!.click();
    });
    expect(container.innerHTML).toContain("acme/gamma is the main repository");
    expect(container.innerHTML).not.toContain("acme/beta is the main repository");

    const unlinkGamma = [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Unlink acme/gamma",
    );
    act(() => {
      unlinkGamma!.click();
    });
    // Option A: first remaining (alpha) becomes main.
    expect(container.innerHTML).toContain("acme/alpha is the main repository");
    expect(container.innerHTML).not.toContain("acme/gamma is the main repository");
    expect(container.innerHTML).not.toContain(NO_MAIN_REPOSITORY_MESSAGE);
  });

  it("shows the local-workspace message after the last linked repository is removed", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(createElement(Interactive, { initialUrls: [ALPHA], initialMain: ALPHA }));
    });
    const unlink = [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Unlink acme/alpha",
    );
    act(() => {
      unlink!.click();
    });
    expect(container.innerHTML).toContain(NO_MAIN_REPOSITORY_MESSAGE);
    expect(container.innerHTML).toContain("No repositories are linked yet.");
  });
});
