import { expect, it } from "vite-plus/test";

import { foldedTestProject, foldedTestRoots } from "./t3team-foldedTests.ts";

it("runs the t3team-sdk tests from the server project", () => {
  expect(foldedTestProject("packages/t3team-sdk/src/t3team-sdk.engine.test.ts")).toBe(
    "apps/server",
  );
  expect(foldedTestRoots("apps/server")).toEqual(["packages/t3team-sdk"]);
});

it("leaves every other test with its own package", () => {
  expect(foldedTestProject("packages/shared/src/model.test.ts")).toBeUndefined();
  expect(foldedTestProject("packages/t3team-sdk-other/src/a.test.ts")).toBeUndefined();
  expect(foldedTestRoots("apps/web")).toEqual([]);
});
