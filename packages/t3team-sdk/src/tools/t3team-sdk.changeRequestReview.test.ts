import { describe, expect, it } from "vite-plus/test";

import {
  executeRegisteredTool,
  type FetchLike,
  type ToolHandlerCtx,
  type ToolWorkspace,
} from "../t3team-sdk.index.ts";
import {
  createChangeRequestReviewDraftTool,
  type ChangeRequestReviewDraftInput,
} from "./t3team-sdk.changeRequestReview.ts";

const unsupportedFetch: FetchLike = async () => {
  throw new Error("Fetch is not available in this test context.");
};

const noopLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as const;

const noopWorkspace: ToolWorkspace = {
  readText: async () => "",
  writeText: async () => {},
  exists: async () => false,
};

function createToolCtx(overrides: Partial<ToolHandlerCtx> = {}): ToolHandlerCtx {
  return {
    workspaceRoot: "/workspace/project",
    log: noopLog,
    fetch: unsupportedFetch,
    workspace: noopWorkspace,
    callTool: async () => {
      throw new Error("Nested tool calls are not expected in this test.");
    },
    ...overrides,
  };
}

/** A minimal successful host response, echoing back the normalized input as the "draft". */
function stubDraft(input: ChangeRequestReviewDraftInput) {
  return {
    ok: true as const,
    draftId: "draft-1",
    replacesExisting: input.replaceLatest,
    commentCount: input.comments.length,
    draft: input,
  };
}

describe("t3team.change_request.review.draft_create", () => {
  it("accepts a single-line comment anchor", async () => {
    const received: Array<ChangeRequestReviewDraftInput> = [];
    const result = await executeRegisteredTool(
      createChangeRequestReviewDraftTool.id,
      {
        event: "COMMENT",
        body: "Looks good overall.",
        comments: [{ path: "src/foo.ts", anchor: { kind: "line", line: 12 }, body: "Nit." }],
      },
      createToolCtx({
        t3team: {
          renameThread: async () => ({ ok: true, title: "" }),
          draftChangeRequestReview: async (input) => {
            received.push(input);
            return stubDraft(input);
          },
        },
      }),
    );

    expect(received).toEqual([
      {
        event: "COMMENT",
        body: "Looks good overall.",
        comments: [{ path: "src/foo.ts", anchor: { kind: "line", line: 12 }, body: "Nit." }],
        replaceLatest: false,
      },
    ]);
    expect(result).toEqual(stubDraft(received[0]!));
  });

  it("accepts a start_line..line range anchor", async () => {
    const received: Array<ChangeRequestReviewDraftInput> = [];
    await executeRegisteredTool(
      createChangeRequestReviewDraftTool.id,
      {
        event: "REQUEST_CHANGES",
        body: "One blocking issue.",
        comments: [
          {
            path: "src/foo.ts",
            anchor: { kind: "range", startLine: 10, line: 14 },
            body: "Extract this block.",
            suggestion: "const x = 1;",
          },
        ],
        replaceLatest: true,
      },
      createToolCtx({
        t3team: {
          renameThread: async () => ({ ok: true, title: "" }),
          draftChangeRequestReview: async (input) => {
            received.push(input);
            return stubDraft(input);
          },
        },
      }),
    );

    expect(received[0]?.comments[0]?.anchor).toEqual({ kind: "range", startLine: 10, line: 14 });
    expect(received[0]?.replaceLatest).toBe(true);
  });

  it("rejects a range anchor whose start is after its end", async () => {
    await expect(
      executeRegisteredTool(
        createChangeRequestReviewDraftTool.id,
        {
          event: "COMMENT",
          body: "x",
          comments: [
            { path: "src/foo.ts", anchor: { kind: "range", startLine: 20, line: 5 }, body: "x" },
          ],
        },
        createToolCtx({ t3team: { renameThread: async () => ({ ok: true, title: "" }) } }),
      ),
    ).rejects.toThrow(`Invalid arguments for tool '${createChangeRequestReviewDraftTool.id}'`);
  });

  it("rejects a comment with an empty path", async () => {
    await expect(
      executeRegisteredTool(
        createChangeRequestReviewDraftTool.id,
        {
          event: "COMMENT",
          body: "x",
          comments: [{ path: "", anchor: { kind: "line", line: 1 }, body: "x" }],
        },
        createToolCtx({ t3team: { renameThread: async () => ({ ok: true, title: "" }) } }),
      ),
    ).rejects.toThrow(`Invalid arguments for tool '${createChangeRequestReviewDraftTool.id}'`);
  });

  it("rejects a suggestion on a comment with no anchor", async () => {
    await expect(
      executeRegisteredTool(
        createChangeRequestReviewDraftTool.id,
        {
          event: "COMMENT",
          body: "x",
          comments: [{ path: "src/foo.ts", body: "x", suggestion: "const y = 2;" }],
        },
        createToolCtx({
          t3team: {
            renameThread: async () => ({ ok: true, title: "" }),
            draftChangeRequestReview: async (input) => stubDraft(input),
          },
        }),
      ),
    ).rejects.toThrow("requires an 'anchor' for comments[0] because it carries a 'suggestion'");
  });

  it("rejects an empty review with no body and no comments", async () => {
    await expect(
      executeRegisteredTool(
        createChangeRequestReviewDraftTool.id,
        { event: "COMMENT", body: "   ", comments: [] },
        createToolCtx({
          t3team: {
            renameThread: async () => ({ ok: true, title: "" }),
            draftChangeRequestReview: async (input) => stubDraft(input),
          },
        }),
      ),
    ).rejects.toThrow(
      "t3team.change_request.review.draft_create requires a non-empty 'body' or at least one comment",
    );
  });

  it("throws a clear error when no t3team change-request review client is wired up", async () => {
    await expect(
      executeRegisteredTool(
        createChangeRequestReviewDraftTool.id,
        { event: "COMMENT", body: "Looks fine.", comments: [] },
        createToolCtx(),
      ),
    ).rejects.toThrow(
      "t3team.change_request.review.draft_create requires a t3team change-request review client in ToolHandlerCtx.",
    );
  });
});
