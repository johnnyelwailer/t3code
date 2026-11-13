/**
 * The Run-on menu's selected cloud entry and the create entry for a project that lives only on
 * cloud machines, in a real browser: progress and failure read inside the one selected entry, and
 * the "not on this computer" hint is quiet and opens nothing by itself.
 */
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { CLOUD_PROJECT_NOT_HERE_HINT, NewCloudSessionItem } from "./t3team-NewCloudSessionItem";
import { RunOnSelectedSessionItem } from "./t3team-RunOnSelectedSessionItem";

describe("RunOnSelectedSessionItem", () => {
  it("shows progress in the selected entry while the machine is on its way, with no Retry", async () => {
    await using screen = await render(
      <RunOnSelectedSessionItem label="New cloud session" status="requesting" onRetry={vi.fn()} />,
      { router: false },
    );
    await expect.element(screen.getByText("New cloud session")).toBeInTheDocument();
    await expect.element(screen.getByText("Getting a machine ready")).toBeInTheDocument();
    expect(screen.container.querySelector("button")).toBeNull();
    expect(screen.container.textContent).not.toMatch(/Requesting a machine|Asking the fleet/);
  });

  it("reads a failed create as shut down, offers Retry, and names no failed step", async () => {
    const onRetry = vi.fn();
    await using screen = await render(
      <RunOnSelectedSessionItem
        label="New cloud session"
        status="createFailed"
        onRetry={onRetry}
      />,
      { router: false },
    );
    await expect.element(screen.getByText(/Shut down/)).toBeInTheDocument();
    expect(screen.container.textContent).not.toMatch(/Failed · at|Capture connect status/);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("NewCloudSessionItem for a project that is only on cloud machines", () => {
  it("shows a quiet hint instead of starting a bare session, and opens no dialog by itself", async () => {
    const onCreate = vi.fn();
    const onClone = vi.fn();
    await using screen = await render(
      <NewCloudSessionItem
        project={undefined}
        pending={false}
        setupPending={false}
        onCreate={onCreate}
        notHere={{ onClone }}
      />,
      { router: false },
    );
    await expect.element(screen.getByText(CLOUD_PROJECT_NOT_HERE_HINT)).toBeInTheDocument();
    expect(document.querySelector("[role=dialog], [role=alertdialog]")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add it to this computer" }));
    expect(onClone).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
