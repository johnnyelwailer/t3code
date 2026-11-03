import type { ComponentProps } from "react";
import { describe, expectTypeOf, it } from "vite-plus/test";

import type { SideChatParentPanel } from "~/lib/sideChatPane";
import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";

import type ChatView from "./ChatView";

type DraftProps = Extract<ComponentProps<typeof ChatView>, { routeKind: "draft" }>;

describe("ChatView draft variant props", () => {
  it("accepts a host panel and the t3team extension props", () => {
    expectTypeOf<DraftProps["embedded"]>().toEqualTypeOf<SideChatParentPanel | undefined>();
    expectTypeOf<DraftProps["beforeDispatchTurnStart"]>().toEqualTypeOf<
      ChatViewT3TeamExtensionProps["beforeDispatchTurnStart"]
    >();
    expectTypeOf<DraftProps["dispatchTurnStartOverride"]>().toEqualTypeOf<
      ChatViewT3TeamExtensionProps["dispatchTurnStartOverride"]
    >();
    expectTypeOf<DraftProps["minimalComposer"]>().toEqualTypeOf<boolean | undefined>();
  });

  it("still needs only the plain draft props", () => {
    expectTypeOf<{
      environmentId: DraftProps["environmentId"];
      threadId: DraftProps["threadId"];
      routeKind: "draft";
      draftId: DraftProps["draftId"];
    }>().toExtend<DraftProps>();
  });
});
