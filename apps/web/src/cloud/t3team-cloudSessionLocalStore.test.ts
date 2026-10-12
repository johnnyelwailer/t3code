import { beforeEach, describe, expect, it } from "vitest";
import type { CloudSession } from "@t3tools/contracts";

import { getCloudSessionLocal, setCloudSessionLocal } from "./t3team-cloudSessionLocalStore";

describe("cloudSessionLocalStore", () => {
  beforeEach(() => {
    setCloudSessionLocal(null);
  });

  it("keeps the just-created session across remounts", () => {
    const session = { sessionId: "pending:1", phase: "requested" } as unknown as CloudSession;
    setCloudSessionLocal({ session, knownServerSessionIds: new Set() });
    expect(getCloudSessionLocal()?.session.sessionId).toBe("pending:1");
  });
});
