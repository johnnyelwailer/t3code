// @vitest-environment jsdom
import { AuthRelayWriteScope } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const sessionState = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("~/environments/primary", () => ({ usePrimarySessionState: () => sessionState }));

import { useCanManageRelay } from "./t3team-useCanManageRelay";

function Probe() {
  return <span>{String(useCanManageRelay())}</span>;
}

function render(): string {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  const text = container.textContent ?? "";
  act(() => root.unmount());
  return text;
}

describe("useCanManageRelay", () => {
  afterEach(() => {
    delete (window as { desktopBridge?: unknown }).desktopBridge;
  });

  it("is false for a standard paired session (relay:read only)", () => {
    sessionState.data = { authenticated: true, scopes: ["relay:read", "chat:write"] };
    expect(render()).toBe("false");
  });

  it("is true once the session holds relay:write", () => {
    sessionState.data = { authenticated: true, scopes: ["relay:read", AuthRelayWriteScope] };
    expect(render()).toBe("true");
  });

  it("is false while the session is unknown or unauthenticated", () => {
    sessionState.data = undefined;
    expect(render()).toBe("false");
    sessionState.data = { authenticated: false };
    expect(render()).toBe("false");
  });

  it("is true in the desktop shell, which is always admin", () => {
    sessionState.data = undefined;
    (window as { desktopBridge?: unknown }).desktopBridge = {};
    expect(render()).toBe("true");
  });
});
