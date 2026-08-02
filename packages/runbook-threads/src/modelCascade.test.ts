import { describe, expect, it } from "vite-plus/test";

import type { AskVerb } from "./askVerb.ts";
import { defineModel } from "./models.ts";
import type { ModelSelection } from "./models.ts";
import { createThreadCascadeAsk, toModelCascadeWire } from "./modelCascade.ts";
import type { AnyAskOpts, ModelCascade } from "./types.ts";

describe("host-neutral model cascades", () => {
  it("normalizes typed model refs to stable wire strings", () => {
    expect(
      toModelCascadeWire([
        { instanceId: "openai", model: defineModel({ provider: "openai", id: "gpt-5" }) },
        { instanceId: "backup" },
      ]),
    ).toEqual([{ instanceId: "openai", model: "gpt-5" }, { instanceId: "backup" }]);
  });

  it("memoizes the thread ladder while resolving an ask-specific ladder separately", async () => {
    const threadLadder: ModelCascade = [{ instanceId: "primary" }];
    const otherLadder: ModelCascade = [{ instanceId: "backup" }];
    const selection: ModelSelection = {
      provider: "primary",
      model: defineModel({ provider: "primary", id: "model-a" }),
    };
    let resolveCount = 0;
    const seen: Array<ModelSelection | undefined> = [];
    const askVerb: AskVerb = async <R>(
      _kind: "thread.turn" | "user.input",
      _threadId: string,
      _prompt: string,
      opts: AnyAskOpts<R> | undefined,
    ): Promise<R> => {
      seen.push(opts?.model);
      return "ok" as R;
    };
    const ask = createThreadCascadeAsk({
      askVerb,
      resolve: async () => {
        resolveCount += 1;
        return selection;
      },
      threadId: "thread-1",
      threadLadder,
    });

    await ask("first", { models: threadLadder });
    await ask("second", { models: threadLadder });
    await ask("other", { models: otherLadder });

    expect(resolveCount).toBe(2);
    expect(seen).toEqual([selection, selection, selection]);
  });
});
