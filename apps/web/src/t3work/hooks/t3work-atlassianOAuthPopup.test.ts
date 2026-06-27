import { describe, expect, it } from "vite-plus/test";
import {
  ATLASSIAN_OAUTH_POPUP_FRAME_NAME,
  buildOAuthPopupFeatures,
} from "./t3work-atlassianOAuthPopup";

describe("t3work-atlassianOAuthPopup", () => {
  it("builds popup features without noopener so the callback can postMessage opener", () => {
    const features = buildOAuthPopupFeatures();
    expect(features).toContain("width=500");
    expect(features).toContain("height=600");
    expect(features).not.toContain("noopener");
    expect(features).not.toContain("noreferrer");
  });

  it("uses a stable popup frame name for desktop shell detection", () => {
    expect(ATLASSIAN_OAUTH_POPUP_FRAME_NAME).toBe("atlassian-oauth");
  });
});
