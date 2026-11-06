import { describe, expect, it } from "vite-plus/test";

import { shouldHandleAppLink } from "./appLinking";

describe("distribution URL scheme acceptance", () => {
  it.each(["nexi://threads/env-1/thread-1", "nexi://threads/env-1/mcp%3Aabc"])(
    "handles a distribution-scheme thread URL %s",
    (url) => {
      expect(shouldHandleAppLink(url, true)).toBe(true);
    },
  );
});
