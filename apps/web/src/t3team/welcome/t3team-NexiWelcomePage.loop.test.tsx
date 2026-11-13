/* oxlint-disable t3code/no-dom-test-environment -- Render-loop budget needs a DOM; this stays a unit file so CI runs it without Playwright. */
/* oxlint-disable t3code/require-disposable-render -- Custom root so a render-loop cap can fail the test. */
// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  LIVE_SHAPED_DISCOVERY,
  RENDER_CAP,
  bumpRenderCount,
  flushEffects,
} from "~/t3team/test/t3team-liveShapedSurface";

void LIVE_SHAPED_DISCOVERY;

const live = vi.hoisted(() => ({ renderCount: 0, starts: 0 }));

vi.mock("~/t3team/welcome/t3team-NexiWelcomeBackend", () => ({
  NexiWelcomeBackend: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("~/t3team/onboarding/t3team-welcomeWizardBrand", () => ({
  useWelcomeWizardBrand: () => ({ productName: "Nexi Work" }),
}));

// Live-shaped actions: a new function identity on every render of the page's hook.
vi.mock("~/t3team/welcome/t3team-useNexiWelcomeActions", () => ({
  useNexiWelcomeActions: (onDone: (ref?: unknown) => void) => ({
    agentRows: [],
    toolStates: {},
    onInstallTool: async () => {},
    onSignInTool: async () => {},
    onCopyAndOpenTool: async () => {},
    jiraEnabled: true,
    jiraDisabledReason: undefined,
    jiraAccounts: [],
    jiraCheck: { status: "idle" },
    jiraConnecting: false,
    onConnectJira: async () => {},
    onRetryJira: async () => {},
    skipped: { jira: false, github: false, account: false, cloud: false },
    skip: () => {},
    githubHosts: ["github.com", "nexplore.ghe.com"],
    githubPrimary: { state: { phase: "idle" }, start: async () => {} },
    githubSecondary: { state: { phase: "idle" }, start: async () => {} },
    onCopyAndOpenGitHubPrimary: async () => {},
    onCopyAndOpenGitHubSecondary: async () => {},
    account: { account: null, pending: false, error: null, signIn: async () => {}, openVerification: () => {} },
    accountCheck: { status: "idle" },
    onRetryAccount: async () => {},
    cloudOn: false,
    cloudUsable: false,
    cloud: { available: false, configured: false },
    onTurnOnCloud: async () => {},
    onSetupPhone: async () => {},
    agentReady: true,
    onStart: async () => {
      live.starts += 1;
      onDone();
    },
  }),
}));

import { NexiWelcomePage } from "~/t3team/welcome/t3team-NexiWelcomePage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Surface() {
  bumpRenderCount(live, "NexiWelcomePage");
  return createElement(NexiWelcomePage, { onDone: () => {} });
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  live.renderCount = 0;
  live.starts = 0;
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

describe("NexiWelcomePage loop guard (live-shaped welcome actions)", () => {
  it("renders setup and stays under the render cap", async () => {
    await act(async () => {
      root!.render(createElement(Surface));
    });
    await flushEffects();
    expect(host!.textContent).toMatch(/Set up Nexi Work|GitHub|Jira|Agents/i);
    expect(live.renderCount).toBeLessThan(RENDER_CAP);
    expect(live.renderCount).toBeLessThan(20);
  });
});
