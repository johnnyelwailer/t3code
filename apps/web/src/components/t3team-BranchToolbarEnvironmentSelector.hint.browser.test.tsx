import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";
import {
  BranchToolbarEnvironmentSelector,
  type BranchToolbarEnvironmentSelectorProps,
} from "./BranchToolbarEnvironmentSelector";

const option = (id: string, label: string, isPrimary: boolean) => ({
  environmentId: EnvironmentId.make(id),
  projectId: ProjectId.make("project-x"),
  label,
  isPrimary,
  machine: "server" as const,
});
const PRIMARY = option("env-primary", "This computer", true);
const RELAY = option("env-relay", "nx-nexi", false);

function selector(
  onCloudMenuHint: () => void,
  displayMode: "toolbar" | "panel",
): BranchToolbarEnvironmentSelectorProps {
  return {
    envLocked: false,
    environmentId: PRIMARY.environmentId,
    availableEnvironments: [PRIMARY, RELAY],
    onEnvironmentChange: vi.fn(),
    onCreateCloudSession: vi.fn(),
    onCloudMenuHint,
    displayMode,
  };
}

describe.each(["toolbar", "panel"] as const)("Run on trigger (%s)", (displayMode) => {
  it("does not hint the cloud list just by being on the page", async () => {
    const hint = vi.fn();
    await using _screen = await render(
      <BranchToolbarEnvironmentSelector {...selector(hint, displayMode)} />,
      { router: false },
    );
    expect(hint).not.toHaveBeenCalled();
  });

  it("hints the cloud list when the pointer reaches the trigger", async () => {
    const hint = vi.fn();
    await using screen = await render(
      <BranchToolbarEnvironmentSelector {...selector(hint, displayMode)} />,
      { router: false },
    );
    await screen.getByLabelText("Run on").hover();
    expect(hint).toHaveBeenCalled();
  });

  it("hints the cloud list when keyboard focus reaches the trigger", async () => {
    const hint = vi.fn();
    await using screen = await render(
      <BranchToolbarEnvironmentSelector {...selector(hint, displayMode)} />,
      { router: false },
    );
    await screen.getByLabelText("Run on").element().focus();
    expect(hint).toHaveBeenCalled();
  });
});
