/**
 * The setup page renders only rows whose actions work. Role, GitHub sign-in, Turn on cloud
 * sessions and phone Set up stay off the page until their fixes land, even with every flag on.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { NexiWelcomeRows } from "./t3team-NexiWelcomePage";

vi.mock("./t3team-useNexiWelcomeActions", () => ({
  useNexiWelcomeActions: () => ({
    account: {
      account: null,
      pending: false,
      error: null,
      signIn: () => {},
      openVerification: () => {},
    },
    skipped: { jira: false, github: false, account: false, cloud: false },
    skip: () => {},
    agentRows: [],
    agentReady: true,
    toolStates: new Map(),
    jiraEnabled: true,
    jiraDisabledReason: "off",
    jiraAccounts: null,
    jiraCheck: "ok",
    jiraConnecting: false,
    roleEnabled: true,
    cloudFlag: true,
    packProfiles: [{ id: "req", label: "Requirements & Product" }],
    chosenRole: null,
    githubHosts: ["nexplore.ghe.com", "github.com"],
    accountCheck: "ok",
    onStart: async () => {},
  }),
}));
vi.mock("~/t3team/onboarding/t3team-welcomeWizardBrand", () => ({
  useWelcomeWizardBrand: () => ({ productName: "Nexi Work" }),
}));
vi.mock("./t3team-NexiWelcomeHeader", () => ({ NexiWelcomeHeader: () => <div>header</div> }));
vi.mock("./t3team-NexiWelcomeAgentsSection", () => ({
  NexiWelcomeAgentsSection: () => <div>agents-row</div>,
}));
vi.mock("./t3team-NexiWelcomeJiraRow", () => ({ NexiWelcomeJiraRow: () => <div>jira-row</div> }));
vi.mock("./t3team-NexiWelcomeAccountRow", () => ({
  NexiWelcomeAccountRow: () => <div>account-row</div>,
}));

describe("Nexi welcome setup rows", () => {
  it("renders Agents, Jira and Account only, with Role, GitHub, cloud and phone hidden", () => {
    const html = renderToStaticMarkup(<NexiWelcomeRows onDone={() => {}} />);
    expect(html).toContain("agents-row");
    expect(html).toContain("jira-row");
    expect(html).toContain("account-row");
    const hidden = [
      "Role",
      "Requirements &amp; Product",
      "GitHub",
      "github.com",
      "Turn on cloud",
      "Phone",
    ];
    for (const text of hidden) {
      expect(html).not.toContain(text);
    }
  });
});
