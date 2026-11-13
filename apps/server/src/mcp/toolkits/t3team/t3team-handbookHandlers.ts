import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpToolAccess from "../../McpToolAccess.ts";
import { HandbookDocs } from "./t3team-handbookDocs.ts";
import { HandbookToolkit } from "./t3team-handbookTools.ts";

export const layer = McpToolAccess.toLayer(HandbookToolkit, {
  nexplore_handbook: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const docs = yield* HandbookDocs;
      if (input.operation === "search") {
        const query = input.query?.trim() ?? "";
        if (query.length === 0) {
          return yield* new OrchestratorMcpFailure({
            code: "invalid_request",
            message: "nexplore_handbook search requires `query`.",
          });
        }
        return { results: yield* docs.search(query, input.limit) };
      }
      const path = input.path?.trim() ?? "";
      if (path.length === 0) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "nexplore_handbook get_page requires `path`.",
        });
      }
      return yield* docs.getPage(path);
    }),
  ),
});
