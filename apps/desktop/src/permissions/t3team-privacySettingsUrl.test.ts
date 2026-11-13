import { assert, describe, it } from "@effect/vitest";

import {
  MAC_PRIVACY_SECURITY_INSTRUCTION,
  MAC_PRIVACY_SECURITY_SETTINGS_URL,
} from "./t3team-privacySettingsUrl.ts";

describe("MAC_PRIVACY_SECURITY_SETTINGS_URL", () => {
  it("is the current Privacy & Security System Settings anchor, not a webloc", () => {
    assert.equal(
      MAC_PRIVACY_SECURITY_SETTINGS_URL,
      "x-apple.systempreferences:com.apple.preference.security?Privacy",
    );
    assert.include(MAC_PRIVACY_SECURITY_INSTRUCTION, "System Settings → Privacy & Security");
    assert.notInclude(MAC_PRIVACY_SECURITY_SETTINGS_URL, ".webloc");
  });
});
