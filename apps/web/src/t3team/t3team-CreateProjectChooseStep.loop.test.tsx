/* oxlint-disable t3code/no-dom-test-environment -- Render-loop budget needs a DOM; this stays a unit file so CI runs it without Playwright. */
/* oxlint-disable t3code/require-disposable-render -- Custom root so a render-loop cap can fail the test. */
/* oxlint-disable react/immutability -- The render budget lives outside the tree so a loop can fail the test. */
// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import { CreateProjectChooseStep } from "~/t3team/t3team-CreateProjectChooseStep";
import {
  LIVE_SHAPED_DISCOVERY,
  RENDER_CAP,
  bumpRenderCount,
  flushEffects,
} from "~/t3team/test/t3team-liveShapedSurface";

void LIVE_SHAPED_DISCOVERY;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENTRIES: JiraCatalogProject[] = [
  {
    entryKey: "site-ex::10001",
    accountId: "site-ex",
    provider: "atlassian",
    externalProjectId: "10001",
    key: "ONE",
    title: "Example One",
    iconUrl: undefined,
    siteHost: "example.atlassian.net",
  },
  {
    entryKey: "site-ex::10002",
    accountId: "site-ex",
    provider: "atlassian",
    externalProjectId: "10002",
    key: "TWO",
    title: "Example Two",
    iconUrl: undefined,
    siteHost: "example.atlassian.net",
  },
];

const live = { renderCount: 0, refreshCalls: 0, chooses: [] as string[] };

function Surface() {
  bumpRenderCount(live, "CreateProjectChooseStep");
  const [tick, setTick] = useState(0);
  // A new `refresh` identity every render, the same way a hook-returned callback
  // would come back from an uncompiled catalog hook.
  const refresh = async () => {
    live.refreshCalls += 1;
    setTick((n) => n + 1);
  };
  return createElement(
    "div",
    { "data-tick": tick },
    createElement(CreateProjectChooseStep, {
      catalogState: {
        catalog: ENTRIES,
        loading: false,
        connected: true,
        error: null,
        siteFailures: [{ label: "Other Site", accountId: "site-b" }],
        refresh,
      },
      boundProjectIds: new Map(),
      connectPanel: createElement("div", { "data-testid": "connect" }, "connect"),
      onChoose: (row) => {
        live.chooses.push(row.entry.title);
      },
    }),
  );
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  live.renderCount = 0;
  live.refreshCalls = 0;
  live.chooses = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("CreateProjectChooseStep loop guard (live-shaped catalog refresh)", () => {
  it("lists projects, a site-failure Retry runs once, and the catalog does not loop", async () => {
    await act(async () => {
      root!.render(createElement(Surface));
    });
    await flushEffects();
    expect(host!.textContent).toContain("Example One");
    expect(host!.textContent).toContain("Example Two");
    const retries = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent === "Retry",
    );
    expect(retries.length).toBeGreaterThanOrEqual(1);
    const before = live.refreshCalls;
    await act(async () => {
      retries[0]!.click();
    });
    await flushEffects();
    expect(live.refreshCalls).toBe(before + 1);
    expect(live.renderCount).toBeLessThan(RENDER_CAP);
    expect(live.renderCount).toBeLessThan(20);
  });
});
