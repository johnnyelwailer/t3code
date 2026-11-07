import { describe, expect, it } from "vite-plus/test";

import { KEPT_SIDE_CHAT_LIMIT, keptSideChatIds } from "./t3team-keptSideChats";

const open = (...ids: string[]) => new Set(ids);

describe("keptSideChatIds", () => {
  it("puts the shown side chat first and keeps the others mounted", () => {
    expect(keptSideChatIds(["a", "b"], "c", open("a", "b", "c"))).toEqual(["c", "a", "b"]);
    expect(keptSideChatIds(["c", "a", "b"], "b", open("a", "b", "c"))).toEqual(["b", "c", "a"]);
  });

  it("keeps the panes while another kind of tab is shown", () => {
    expect(keptSideChatIds(["a", "b"], null, open("a", "b"))).toEqual(["a", "b"]);
  });

  it("drops closed side chats and stops at the limit", () => {
    expect(keptSideChatIds(["a", "b"], null, open("b"))).toEqual(["b"]);
    const many = keptSideChatIds(["b", "c", "d"], "a", open("a", "b", "c", "d"));
    expect(many).toEqual(["a", "b", "c"]);
    expect(many).toHaveLength(KEPT_SIDE_CHAT_LIMIT);
  });
});
