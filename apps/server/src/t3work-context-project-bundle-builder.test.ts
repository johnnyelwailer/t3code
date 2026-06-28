import type { ProjectShellProjectId } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import { buildT3workProjectContextBundle } from "./t3work-context-project-bundle-builder.ts";

describe("buildT3workProjectContextBundle", () => {
  it("writes work-items index and project entrypoint", () => {
    const bundle = buildT3workProjectContextBundle({
      project: {
        id: "project-1" as ProjectShellProjectId,
        title: "Project One",
        source: {
          provider: "atlassian",
          accountId: "mock-atlassian",
          externalProjectId: "jira-proj-checkout",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      linkedRepositoryUrls: ["https://github.com/acme/checkout"],
      tickets: [
        {
          id: "ac-91",
          projectId: "project-1",
          ref: {
            provider: "atlassian",
            kind: "issue",
            id: "ac-91",
            displayId: "AC-91",
            title: "Payment retry banner",
            url: "https://acme.atlassian.net/browse/AC-91",
            projectId: "jira-proj-checkout",
          },
          status: "Open",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(bundle.workItemCount).toBe(1);
    expect(bundle.files.some((file) => file.relativePath.endsWith("work-items/index.json"))).toBe(
      true,
    );
    expect(bundle.files.at(-1)?.relativePath).toBe(".t3work/context/entrypoint.json");
  });
});
