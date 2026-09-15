import { assert, it } from "@effect/vitest";

import { parseLinkedRepositoryUrls } from "./t3team-LinkedRepositories.ts";

it("parses https and ssh remotes into host, repository, and provider", () => {
  const parsed = parseLinkedRepositoryUrls([
    "https://github.com/acme/web.git",
    "git@gitlab.com:group/web.git",
  ]);
  assert.deepStrictEqual(parsed, [
    { host: "github.com", repository: "acme/web", kind: "github" },
    { host: "gitlab.com", repository: "group/web", kind: "gitlab" },
  ]);
});

it("resolves an Azure DevOps remote to the repository name, not the path", () => {
  const [entry] = parseLinkedRepositoryUrls(["https://dev.azure.com/org/project/_git/web"]);
  assert.deepStrictEqual(entry, {
    host: "dev.azure.com",
    repository: "web",
    kind: "azure-devops",
  });
});

it("deduplicates the same repository recorded once per form", () => {
  const parsed = parseLinkedRepositoryUrls([
    "https://github.com/acme/web",
    "https://github.com/acme/web.git",
    "git@github.com:acme/web",
  ]);
  assert.deepStrictEqual(parsed, [{ host: "github.com", repository: "acme/web", kind: "github" }]);
});

it("keeps one repository per host, and drops a URL that reads as nothing", () => {
  const parsed = parseLinkedRepositoryUrls([
    "https://github.com/acme/web",
    "https://gitlab.com/acme/web",
    "not a url",
    "   ",
  ]);
  assert.deepStrictEqual(parsed, [
    { host: "github.com", repository: "acme/web", kind: "github" },
    { host: "gitlab.com", repository: "acme/web", kind: "gitlab" },
  ]);
});

it("reports an unrecognised host as the unknown provider", () => {
  const [entry] = parseLinkedRepositoryUrls(["https://gerrit.example.test/acme/web"]);
  assert.deepStrictEqual(entry, {
    host: "gerrit.example.test",
    repository: "acme/web",
    kind: "unknown",
  });
});
