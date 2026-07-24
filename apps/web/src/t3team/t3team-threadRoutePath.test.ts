import { describe, expect, it } from "vite-plus/test";

import { parseActiveThreadFromPath } from "~/t3team/t3team-threadRoutePath";

describe("parseActiveThreadFromPath", () => {
  it("decodes project and thread ids from a valid t3team thread route", () => {
    expect(
      parseActiveThreadFromPath("/t3team/projects/Project%20Alpha/threads/thread%2F123"),
    ).toEqual({
      projectId: "Project Alpha",
      threadId: "thread/123",
    });
  });

  it("returns null for non-thread or incomplete routes", () => {
    expect(parseActiveThreadFromPath("/t3team/projects/Project%20Alpha")).toBeNull();
    expect(
      parseActiveThreadFromPath("/other/projects/Project%20Alpha/threads/thread-123"),
    ).toBeNull();
    expect(parseActiveThreadFromPath("/t3team/projects/Project%20Alpha/threads/")).toBeNull();
  });
});
