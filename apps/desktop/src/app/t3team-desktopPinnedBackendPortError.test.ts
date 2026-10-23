import { assert, describe, it } from "@effect/vitest";

import { DesktopPinnedBackendPortBusyError } from "./DesktopBackendPort.ts";

describe("DesktopPinnedBackendPortBusyError", () => {
  it("explains a busy pinned backend port", () => {
    const error = new DesktopPinnedBackendPortBusyError({
      port: 3_773,
      hosts: ["127.0.0.1", "0.0.0.0", "::"],
    });

    assert.equal(error.port, 3_773);
    assert.equal(
      error.message,
      "The desktop backend is pinned to port 3773, but it is already in use on 127.0.0.1, 0.0.0.0, ::. Quit the app holding that port, or set T3CODE_PORT to run on another port.",
    );
  });
});
