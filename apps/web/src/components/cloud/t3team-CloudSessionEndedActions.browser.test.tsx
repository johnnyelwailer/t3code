import { EnvironmentId, ProjectId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";

const environmentId = EnvironmentId.make("env-ws");
const restartProjectId = ProjectId.make("project-restart");
const onCreate = vi.fn();
const onSessionAction = vi.fn();
const onPanelVisibilityChange = vi.fn();
let controller: Record<string, unknown> = {};

vi.mock("~/cloud/t3team-useCloudSessionController", () => ({
  useCloudSessionController: () => controller,
}));

const { CloudSessionEndedActions } = await import("./t3team-CloudSessionEndedActions");

function setController(overrides: Record<string, unknown>) {
  onCreate.mockClear();
  onSessionAction.mockClear();
  controller = {
    available: true,
    sessions: [] as CloudSession[],
    createPending: false,
    onCreate,
    onSessionAction,
    onPanelVisibilityChange,
    ...overrides,
  };
}

describe("CloudSessionEndedActions", () => {
  it("starts another cloud session in the ended session's project", async () => {
    setController({});
    await using screen = await render(
      <CloudSessionEndedActions
        environmentId={environmentId}
        restartProjectId={restartProjectId}
      />,
      { router: false },
    );
    await screen.getByRole("button", { name: "Start another cloud session" }).click();
    expect(onCreate).toHaveBeenCalledWith(restartProjectId);
  });

  it("starts a plain session when the ended one had no project", async () => {
    setController({});
    await using screen = await render(
      <CloudSessionEndedActions environmentId={environmentId} restartProjectId={null} />,
      { router: false },
    );
    await screen.getByRole("button", { name: "Start another cloud session" }).click();
    expect(onCreate).toHaveBeenCalledWith(undefined);
  });

  it("shows a disabled progress button while the new session starts", async () => {
    setController({ createPending: true });
    await using screen = await render(
      <CloudSessionEndedActions
        environmentId={environmentId}
        restartProjectId={restartProjectId}
      />,
      { router: false },
    );
    const button = screen.getByRole("button", { name: "Starting a cloud session…" });
    await expect.element(button).toBeDisabled();
  });

  it("offers to connect once the new session is ready for the same environment", async () => {
    const ready = {
      sessionId: "9",
      phase: "ready",
      environmentId: "env-ws",
      providerKind: "github_actions",
    } as CloudSession;
    setController({ sessions: [ready] });
    await using screen = await render(
      <CloudSessionEndedActions
        environmentId={environmentId}
        restartProjectId={restartProjectId}
      />,
      { router: false },
    );
    await screen.getByRole("button", { name: "Connect to the new session" }).click();
    expect(onSessionAction).toHaveBeenCalledWith(ready);
  });

  it("offers nothing where cloud sessions cannot be started", async () => {
    setController({ available: false });
    await using screen = await render(
      <CloudSessionEndedActions
        environmentId={environmentId}
        restartProjectId={restartProjectId}
      />,
      { router: false },
    );
    expect(screen.container.textContent).toBe("");
  });
});
