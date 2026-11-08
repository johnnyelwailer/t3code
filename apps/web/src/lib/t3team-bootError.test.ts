/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vite-plus/test";

import { showBootError } from "./bootError";

afterEach(() => {
  document.body.innerHTML = "";
  delete document.documentElement.dataset.t3teamBootAppName;
});

describe("showBootError", () => {
  it("uses the pack name the boot script stored, and the vendor name otherwise", () => {
    document.body.innerHTML = `<div id="boot-shell"></div>`;
    showBootError(new Error("boom"));
    expect(document.querySelector("#boot-error h1")?.textContent).toBe("T3 Code failed to start");

    document.documentElement.dataset.t3teamBootAppName = "Pack Product";
    document.body.innerHTML = `<div id="boot-shell"></div>`;
    showBootError(new Error("boom"));
    expect(document.querySelector("#boot-error h1")?.textContent).toBe(
      "Pack Product failed to start",
    );
    // The recovery copy names the pack product too, not the vendor.
    expect(document.querySelector("#boot-error")?.textContent).toContain(
      "Run this on the computer that runs Pack Product.",
    );
  });
});
