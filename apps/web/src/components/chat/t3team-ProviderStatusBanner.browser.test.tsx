import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ProviderStatusBanner } from "./ProviderStatusBanner";

function warningProvider(): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make("codex"),
    driver: ProviderDriverKind.make("codex"),
    displayName: "Codex",
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "warning",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-23T12:00:00.000Z",
    message: "Provider is temporarily degraded.",
    models: [],
    slashCommands: [],
    skills: [],
  };
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderBanner(status: ServerProvider) {
  await act(() => root.render(<ProviderStatusBanner status={status} onDismiss={() => {}} />));
}

describe("ProviderStatusBanner dismiss control", () => {
  it("announces provider warnings politely and labels the dismiss control", async () => {
    await renderBanner(warningProvider());

    // A degraded provider is not an emergency: `status` announces politely, `alert` interrupts.
    // Only a real error (auth failure, a provider that answered badly) keeps the assertive role.
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('[data-provider-status-severity="warning"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Dismiss Codex provider warning"]')).not.toBeNull();
  });

  it("labels error dismiss controls with the correct severity", async () => {
    await renderBanner({ ...warningProvider(), status: "error" });

    expect(container.querySelector('[aria-label="Dismiss Codex provider error"]')).not.toBeNull();
  });
});
