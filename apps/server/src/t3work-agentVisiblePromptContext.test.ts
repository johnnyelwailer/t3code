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
});
