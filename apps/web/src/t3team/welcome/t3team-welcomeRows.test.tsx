import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { NexiWelcomeAccountRow } from "./t3team-NexiWelcomeAccountRow";
import { NexiWelcomeJiraRow } from "./t3team-NexiWelcomeJiraRow";
import type { WelcomeCheck } from "./t3team-welcomeCheck.logic";

const buttonLabels = (html: string) =>
  Array.from(html.matchAll(/<button[^>]*>(.*?)<\/button>/g), (match) => match[1]);

const noop = () => undefined;

function jira(check: WelcomeCheck) {
  return renderToStaticMarkup(
    <NexiWelcomeJiraRow
      enabled
      disabledReason="off"
      accounts={null}
      check={check}
      skipped={false}
      connecting={false}
      onConnect={noop}
      onRetry={noop}
      onSkip={noop}
    />,
  );
}

describe("Jira row", () => {
  it("shows plain copy and exactly one Retry when the check failed", () => {
    const html = jira("failed");
    expect(html).toContain("Can&#x27;t check Jira right now.");
    expect(html).not.toContain("Checking");
    expect(buttonLabels(html).filter((label) => label === "Retry")).toHaveLength(1);
  });

  it("shows Checking only while the check runs, and no Retry", () => {
    const checking = jira("checking");
    expect(checking).toContain("Checking…");
    expect(buttonLabels(checking)).not.toContain("Retry");
    expect(buttonLabels(jira("settled"))).not.toContain("Retry");
  });
});

describe("Nexplore row when the service is unreachable", () => {
  it("shows plain copy and one Retry, not the raw error and not Sign in", () => {
    const html = renderToStaticMarkup(
      <NexiWelcomeAccountRow
        account={null}
        check="failed"
        pending={false}
        error="TypeError: Failed to fetch"
        skipped={false}
        onSignIn={noop}
        onOpenVerification={noop}
        onSkip={noop}
        onRetry={noop}
      />,
    );
    expect(html).toContain("reach Nexplore right now");
    expect(html).not.toContain("Failed to fetch");
    expect(buttonLabels(html)).toEqual(["Retry"]);
  });
});
