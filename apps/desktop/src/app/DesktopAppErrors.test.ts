import { assert, describe, it } from "@effect/vitest";

import {
  DesktopBackendPortUnavailableError,
  DesktopDevelopmentBackendPortRequiredError,
  DesktopPinnedBackendPortBusyError,
} from "./DesktopApp.ts";

describe("DesktopApp errors", () => {
  it("preserves unavailable backend port context", () => {
    const error = new DesktopBackendPortUnavailableError({
      startPort: 3_773,
      maxPort: 65_535,
      hosts: ["127.0.0.1", "0.0.0.0", "::"],
    });

    assert.equal(error.startPort, 3_773);
    assert.equal(error.maxPort, 65_535);
    assert.deepEqual(error.hosts, ["127.0.0.1", "0.0.0.0", "::"]);
    assert.equal(
      error.message,
      "No desktop backend port is available on hosts 127.0.0.1, 0.0.0.0, :: between 3773 and 65535.",
    );
  });

  it("reports the required development port", () => {
    const error = new DesktopDevelopmentBackendPortRequiredError();

    assert.equal(error.message, "T3CODE_PORT is required in desktop development.");
  });

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
