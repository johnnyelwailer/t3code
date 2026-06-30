import { describe, expect, it } from "vite-plus/test";

import { writeIntegrationCache } from "~/t3work/hooks/t3work-integrationCache";

import {
  findAtlassianAccountDisplayName,
  readCachedAtlassianCurrentUserDisplayName,
} from "./t3work-useAtlassianCurrentUserDisplayName";

describe("use Atlassian current user display name", () => {
  it("finds the label for the current account from a loaded account list", () => {
    expect(
      findAtlassianAccountDisplayName(
        [
          { id: "account-1", provider: "atlassian", label: "Philip Jonientz" },
          { id: "account-2", provider: "atlassian", label: "Alex" },
        ],
        "account-1",
      ),
    ).toBe("Philip Jonientz");
  });

  it("matches Atlassian project site URLs against accountUrl", () => {
    expect(
      findAtlassianAccountDisplayName(
        [
          {
            id: "db095f0c-3377-4104-b059-e52c59babbfa",
            provider: "atlassian",
            label: "Philip Jonientz",
            accountUrl: "https://nexwork.atlassian.net",
          },
        ],
        "https://nexwork.atlassian.net/",
      ),
    ).toBe("Philip Jonientz");
  });

  it("still matches direct account ids", () => {
    expect(
      findAtlassianAccountDisplayName(
        [
          {
            id: "cloud-1",
            provider: "atlassian",
            label: "Pat Jones",
          },
        ],
        "cloud-1",
      ),
    ).toBe("Pat Jones");
  });

  it("reads the current account label from the integration cache", () => {
    writeIntegrationCache("atlassian:listAccounts", [
      { id: "account-1", provider: "atlassian", label: "Philip Jonientz" },
    ]);

    expect(readCachedAtlassianCurrentUserDisplayName("account-1")).toBe("Philip Jonientz");
  });
});
