// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { JiraCatalogSiteFailure } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

import { T3TeamSidebarProjectScopePillsView } from "./t3team-SidebarProjectScopePills";

const failure: JiraCatalogSiteFailure = {
  accountId: "acc-b",
  provider: "atlassian",
  siteHost: "broken.atlassian.net",
  label: "broken.atlassian.net",
  error: "site down",
};

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class ResizeObserver {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserver);
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe("project scope failed site", () => {
  it("shows the failed site as its own pill and retries that site", async () => {
    const onRetrySite = vi.fn();
    await act(async () => {
      root = createRoot(container);
      root.render(
        <T3TeamSidebarProjectScopePillsView
          groups={[]}
          addable={[]}
          siteFailures={[failure]}
          onRetrySite={onRetrySite}
          activeScopeKey={null}
          onSelectScope={() => {}}
        />,
      );
    });
    const retry = container.querySelector<HTMLButtonElement>(
      '[aria-label="Retry broken.atlassian.net"]',
    );
    expect(retry?.textContent).toContain("broken.atlassian.net");
    await act(async () => retry?.click());
    expect(onRetrySite).toHaveBeenCalledExactlyOnceWith("acc-b");
  });
});
