import { describe, expect, it } from "vite-plus/test";

import { buildT3TeamWorkItemContextBundle } from "./t3team-context-bundle-builder.ts";

describe("buildT3TeamWorkItemContextBundle", () => {
  it("writes attachment files before full manifest and entrypoint", () => {
    const bundle = buildT3TeamWorkItemContextBundle({
      projectId: "project-1",
      rootKey: "PROJ-1",
      nodes: [
        {
          key: "PROJ-1",
          depth: 0,
          ticket: null,
          snapshot: null,
          relationshipKeys: { childKeys: [], referenceKeys: [] },
        },
      ],
      attachmentFiles: [
        {
          relativePath: ".t3team/context/jira/project-1/items/proj-1/attachments/index.json",
          contents: "{}",
        },
      ],
      attachmentIndexes: new Map([
        [
          "PROJ-1",
          {
            indexRelativePath: ".t3team/context/jira/project-1/items/proj-1/attachments/index.json",
            attachmentCount: 1,
            downloadedCount: 1,
            failedCount: 0,
          },
        ],
      ]),
    });

    const paths = bundle.files.map((file) => file.relativePath);
    expect(
      paths.indexOf(".t3team/context/jira/project-1/items/proj-1/attachments/index.json"),
    ).toBeLessThan(paths.indexOf(".t3team/context/jira/project-1/items/proj-1/entrypoint.json"));
    expect(bundle.files.at(-1)?.contents).toContain('"availability": "full"');
  });
});
