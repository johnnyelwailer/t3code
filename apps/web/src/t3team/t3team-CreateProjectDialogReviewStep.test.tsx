// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";
import type { IntegrationAccount } from "@t3tools/integrations-core";

import { ReviewStep } from "./t3team-CreateProjectDialogReviewStep";

/**
 * The old review step rendered one line — "Turns on: <packs> · N starter recipes · N repos
 * linked" — and never named the selected setup profile at all. This proves the rebuilt step
 * states the things a "last chance to check before Add project" screen should: the setup
 * profile by name, the Jira site, linked (or absent) repositories, and the workspace path the
 * project will be created at.
 */

const account: IntegrationAccount = {
  id: "site-acme",
  provider: "atlassian",
  label: "Acme Product",
  accountUrl: "https://nexwork.atlassian.net",
};

async function renderReviewStep(props: Parameters<typeof ReviewStep>[0]) {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(<ReviewStep {...props} />);
  });
  return host;
}

describe("ReviewStep", () => {
  it("names the selected setup profile and shows the workspace path", async () => {
    const host = await renderReviewStep({
      setupProfileId: "engineering-copilot",
      customProfile: undefined,
      linkedRepositoryUrls: [],
      selectedAccount: account,
      projectTitle: "Nexi AI",
    });

    expect(host.textContent).toContain("Engineering Copilot");
    expect(host.textContent).toContain("t3team/projects/Nexi AI");
    expect(host.textContent).toContain("nexwork.atlassian.net");
    expect(host.textContent).toContain("None linked");
  });

  it("prefers a cloned custom profile's own title over the catalog", async () => {
    const host = await renderReviewStep({
      setupProfileId: "my-custom-profile",
      customProfile: {
        id: "my-custom-profile",
        title: "My Team Partner",
        description: "A cloned starter, tuned for this team.",
        audience: "mixed",
        communicationStyle: {
          technicalDepth: "medium",
          brevity: "balanced",
          guidanceStyle: "balanced",
        },
        preferredArtifactKinds: [],
        defaultRecipeWeights: {},
        recommendedSkillPackIds: [],
        hideImplementationComplexity: false,
      },
      linkedRepositoryUrls: ["https://github.com/acme/mobile-checkout"],
      selectedAccount: account,
      projectTitle: "Nexi AI",
    });

    expect(host.textContent).toContain("My Team Partner");
    expect(host.textContent).toContain("A cloned starter, tuned for this team.");
    expect(host.textContent).toContain("mobile-checkout");
  });
});
