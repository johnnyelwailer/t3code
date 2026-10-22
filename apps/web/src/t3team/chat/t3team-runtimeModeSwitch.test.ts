import { describe, expect, it } from "vite-plus/test";

import { planRuntimeModeSwitch } from "./t3team-runtimeModeSwitch";

describe("planRuntimeModeSwitch", () => {
  it("persists auto → full-access on a running server thread right away", () => {
    expect(
      planRuntimeModeSwitch({
        mode: "full-access",
        currentMode: "auto",
        isServerThread: true,
        serverRuntimeMode: "auto",
      }),
    ).toBe("persist");
  });

  it("persists even when the composer draft already shows the new mode", () => {
    // The old picker only wrote the draft; the server stayed on auto until a typed send.
    expect(
      planRuntimeModeSwitch({
        mode: "full-access",
        currentMode: "full-access",
        isServerThread: true,
        serverRuntimeMode: "auto",
      }),
    ).toBe("persist");
  });

  it("does nothing when the server thread already runs in that mode", () => {
    expect(
      planRuntimeModeSwitch({
        mode: "auto",
        currentMode: "full-access",
        isServerThread: true,
        serverRuntimeMode: "auto",
      }),
    ).toBe("none");
  });

  it("keeps a local draft thread's choice in the draft", () => {
    expect(
      planRuntimeModeSwitch({
        mode: "full-access",
        currentMode: "auto",
        isServerThread: false,
        serverRuntimeMode: undefined,
      }),
    ).toBe("draft");
    expect(
      planRuntimeModeSwitch({
        mode: "auto",
        currentMode: "auto",
        isServerThread: false,
        serverRuntimeMode: undefined,
      }),
    ).toBe("none");
  });
});
