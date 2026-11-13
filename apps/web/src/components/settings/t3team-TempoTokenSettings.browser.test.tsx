import { userEvent } from "vite-plus/test/browser";
import { describe, expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { BackendProvider } from "../../t3team/backend/t3team-BackendContext";
import { createMockBackend } from "../../t3team/backend/t3team-mockBackend";
import type { AtlassianBackendApi } from "../../t3team/backend/t3team-atlassianBackendTypes";

import { TempoTokenSettings } from "./t3team-TempoTokenSettings";

function tempoBackend(input: {
  readonly status?: boolean;
  readonly statusError?: boolean;
  readonly setTempoToken?: (token: string | null) => Promise<{ configured: boolean }>;
}) {
  const mock = createMockBackend();
  const atlassian: AtlassianBackendApi = {
    ...mock.atlassian,
    getTempoStatus:
      input.statusError === true
        ? async () => {
            throw new Error("offline");
          }
        : async () => ({ configured: input.status ?? false }),
    setTempoToken: input.setTempoToken ?? (async (token) => ({ configured: token !== null })),
  };
  return { ...mock, atlassian };
}

async function renderTempo(backend: Parameters<typeof BackendProvider>[0]["backend"]) {
  return await render(
    <BackendProvider backend={backend}>
      <TempoTokenSettings />
    </BackendProvider>,
    { router: false },
  );
}

describe("TempoTokenSettings", () => {
  it("asks for a token when none is configured and hides it after saving", async () => {
    const calls: Array<string | null> = [];
    await using screen = await renderTempo(
      tempoBackend({
        status: false,
        setTempoToken: async (token) => {
          calls.push(token);
          return { configured: true };
        },
      }),
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Tempo API token" }), "tempo-pat-123");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await expect.element(screen.getByText("Configured")).toBeInTheDocument();
    expect(calls).toEqual(["tempo-pat-123"]);
    // The stored token is never displayed again.
    await expect.element(screen.getByText("tempo-pat-123")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("removes the token", async () => {
    const calls: Array<string | null> = [];
    await using screen = await renderTempo(
      tempoBackend({
        status: true,
        setTempoToken: async (token) => {
          calls.push(token);
          return { configured: token !== null };
        },
      }),
    );
    await expect.element(screen.getByText("Configured")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await expect
      .element(screen.getByRole("textbox", { name: "Tempo API token" }))
      .toBeInTheDocument();
    expect(calls).toEqual([null]);
  });

  it("offers a retry when the status cannot be read", async () => {
    await using screen = await renderTempo(tempoBackend({ statusError: true }));
    await expect.element(screen.getByText("Could not read the Tempo token.")).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
