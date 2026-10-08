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
    expect(document.querySelector("#boot-error p")?.textContent).toBe("T3 Code could not load.");

    document.documentElement.dataset.t3teamBootAppName = "Pack Product";
    document.body.innerHTML = `<div id="boot-shell"></div>`;
    showBootError(new Error("boom"));
    expect(document.querySelector("#boot-error p")?.textContent).toBe(
      "Pack Product could not load.",
    );
  });
});
