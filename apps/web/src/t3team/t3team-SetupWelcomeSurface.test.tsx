// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createLucideReactMock } from "./t3team-createLucideReactMock";
import { T3TeamSetupWelcomeSurface } from "./t3team-SetupWelcomeSurface";

/**
 * The first-run setup surface is the one place the work profile chooser is impossible to miss, so
 * the WORK_PROFILE_CHOOSER gate is asserted on what a user actually sees: the profile cards, the
 * "who are you" heading, the selected-profile chip, and the numbered step list.
 */

vi.mock("lucide-react", (importOriginal) => createLucideReactMock(importOriginal));

const chooserEnabled = { current: false };
vi.mock("~/t3team/t3team-workProfileChooser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./t3team-workProfileChooser")>();
  return { ...actual, useT3TeamWorkProfileChooserEnabled: () => chooserEnabled.current };
});

const packProfiles: readonly EnvironmentSetupProfile[] = [
  {
    id: "requirements-product",
    title: "Requirements Partner",
    description: "Shapes requirements with the team.",
    badge: "REQ",
    bullets: ["Refine scope"],
    category: "product",
    default: true,
  },
  {
    id: "engineer",
    title: "Developer",
    description: "Implementation guidance with diff-first defaults.",
    badge: "DEV",
    bullets: ["Plan changes"],
    category: "engineering",
  },
];

const hosts: HTMLElement[] = [];

afterEach(() => {
  hosts.length = 0;
});

async function render(): Promise<HTMLElement> {
  const host = document.createElement("div");
  hosts.push(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <T3TeamSetupWelcomeSurface onCreate={() => undefined} profilesOverride={packProfiles} />,
    );
  });
  return host;
}

describe("T3TeamSetupWelcomeSurface work profile chooser gate", () => {
  it("hides the chooser, its chip and its step when the flag is off", async () => {
    chooserEnabled.current = false;
    const host = await render();

    expect(host.textContent).not.toContain("Who are you, and how do you want to work?");
    expect(host.textContent).not.toContain("Selected profile");
    expect(host.textContent).not.toContain("Pick your style");
    expect(host.querySelectorAll("[data-profile-id]")).toHaveLength(0);
    // The copy must not promise a choice that is not offered.
    expect(host.textContent).not.toContain("Pick how you want");
    expect(host.textContent).toContain(
      "Connect a Jira project and start from a workspace that feels ready out of the box.",
    );

    // Remaining steps are renumbered, and the rest of the surface is intact.
    const stepNumbers = Array.from(host.querySelectorAll("div"))
      .map((node) => node.textContent?.trim())
      .filter((text) => text === "01" || text === "02" || text === "03");
    expect(stepNumbers).toEqual(["01", "02"]);
    expect(host.textContent).toContain("Connect Jira");
    expect(host.textContent).toContain("Start working");
    expect(host.textContent).toContain("Set up first project");
  });

  it("renders the chooser, its chip and its step when the flag is on", async () => {
    chooserEnabled.current = true;
    const host = await render();

    expect(host.textContent).toContain("Who are you, and how do you want to work?");
    expect(host.textContent).toContain("Selected profile: Requirements Partner");
    expect(host.textContent).toContain("Pick your style");
    expect(host.querySelector('[data-profile-id="engineer"]')).not.toBeNull();
    expect(host.querySelector('[data-profile-id="requirements-product"]')).not.toBeNull();
    expect(host.textContent).toContain("Pick how you want");
  });
});
