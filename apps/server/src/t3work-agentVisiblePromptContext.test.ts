import { describe, expect, it } from "vitest";

import { formatAgentVisiblePromptContext } from "./t3work-agentVisiblePromptContext.ts";

describe("formatAgentVisiblePromptContext", () => {
  it("projects agent-visible system attachments beyond views", () => {
    const contextText = formatAgentVisiblePromptContext([
      {
        id: "message-1" as any,
        role: "system",
        text: "Workflow assets ready",
        createdAt: "2026-05-28T12:00:00.000Z",
        t3workExt: {
          attachments: [
            {
              kind: "resource",
              resource: {
                ref: {
                  provider: "atlassian",
                  kind: "ticket",
                  id: "resource-1",
                  displayId: "PROJ-123",
                  title: "Fix import crash",
                  status: "In Progress",
                  url: "https://example.test/browse/PROJ-123",
                },
                fetchedAt: "2026-05-28T12:00:00.000Z",
                fields: {},
              },
            },
            {
              kind: "artifact",
              artifact: {
                kind: "implementation-plan",
                label: "Implementation plan",
                path: ".t3work/artifacts/plan.md",
              },
            },
            {
              kind: "file",
              file: {
                id: "file-1",
                label: "runbook.md",
                mimeType: "text/markdown",
                sizeBytes: 2048,
              },
            },
            {
              kind: "image",
              image: {
                id: "image-1",
                label: "wireframe.png",
                mimeType: "image/png",
              },
              alt: "UI wireframe",
            },
            {
              kind: "view",
              miniappId: "t3work.custom-view",
              props: { section: "summary" },
            },
          ],
        },
      } as any,
    ]);

    expect(contextText).toContain("Workflow context:");
    expect(contextText).toContain("- Workflow assets ready");
    expect(contextText).toContain(
      "- Resource attachment: PROJ-123 - Fix import crash (atlassian ticket; status: In Progress; https://example.test/browse/PROJ-123)",
    );
    expect(contextText).toContain(
      "- Artifact attachment: Implementation plan (implementation-plan; .t3work/artifacts/plan.md)",
    );
    expect(contextText).toContain(
      "- File attachment: runbook.md (text/markdown; 2048 bytes; contents not yet projected)",
    );
    expect(contextText).toContain(
      "- Image attachment: wireframe.png (image/png; alt: UI wireframe; media contents not yet projected)",
    );
    expect(contextText).toContain("- View attachment: t3work.custom-view");
  });

  it("inlines textual file attachments and resource snapshot fields when available", () => {
    const contextText = formatAgentVisiblePromptContext([
      {
        id: "message-2" as any,
        role: "system",
        text: "Expanded workflow context",
        createdAt: "2026-05-28T12:00:10.000Z",
        t3workExt: {
          attachments: [
            {
              kind: "file",
              file: {
                id: "context-json",
                label: "Recipe context (context.json)",
                mimeType: "application/json",
                url: `data:application/json;base64,${Buffer.from('{"project":{"title":"Project Alpha"}}').toString("base64")}`,
              },
            },
            {
              kind: "resource",
              resource: {
                ref: {
                  provider: "github",
                  kind: "pull-request",
                  id: "42",
                  displayId: "PR-42",
                  title: "Fix import crash",
                },
                fetchedAt: "2026-05-28T12:00:10.000Z",
                summary: "Active pull request linked to the selected work item.",
                fields: {
                  state: "open",
                  author: "pj",
                },
              },
            },
          ],
        },
      } as any,
    ]);

    expect(contextText).toContain("Expanded workflow context");
    expect(contextText).toContain('{"project":{"title":"Project Alpha"}}');
    expect(contextText).toContain("Active pull request linked to the selected work item.");
    expect(contextText).toContain('"state": "open"');
  });
});
