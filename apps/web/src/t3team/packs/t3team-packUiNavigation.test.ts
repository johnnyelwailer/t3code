import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { describe, expect, it } from "vite-plus/test";

import { findChangeRequestProject } from "./t3team-packUiNavigation";

const project = (id: string, canonicalKey: string, owner: string, name: string) =>
  ({
    id,
    repositoryIdentity: { canonicalKey, provider: "github", owner, name },
  }) as unknown as EnvironmentProject;

const publicApp = project("public", "github.com/acme/app", "acme", "app");
const enterpriseApp = project("enterprise", "github.acme.test/acme/app", "acme", "app");
const other = project("other", "github.com/acme/site", "acme", "site");

describe("findChangeRequestProject", () => {
  it("tells two hosts with one repository selector apart by the ref's host", () => {
    const projects = [publicApp, enterpriseApp, other];

    expect(
      findChangeRequestProject(projects, {
        repository: "acme/app",
        number: 7,
        host: "github.acme.test",
      }),
    ).toBe(enterpriseApp);
    expect(
      findChangeRequestProject(projects, { repository: "acme/app", number: 7, host: "GitHub.com" }),
    ).toBe(publicApp);
  });

  it("takes the first project holding the repository when the ref names no host", () => {
    expect(
      findChangeRequestProject([other, enterpriseApp, publicApp], {
        repository: "ACME/app",
        number: 7,
      }),
    ).toBe(enterpriseApp);
  });

  it("finds nothing for a repository no project holds", () => {
    expect(
      findChangeRequestProject([publicApp, other], { repository: "acme/missing", number: 1 }),
    ).toBeUndefined();
  });
});
