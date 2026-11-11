import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ModelPickerSignInRefreshNotice,
  modelPickerSignInRefreshMessage,
} from "./t3team-ModelPickerSignInRefreshNotice";

describe("modelPickerSignInRefreshMessage", () => {
  it("matches Settings for a lapsed account, and keeps the Signed in wording otherwise", () => {
    expect(
      modelPickerSignInRefreshMessage({
        status: "unauthenticated",
        displayName: "Claude",
        error: null,
      }),
    ).toBe("Not authenticated. Sign in to use this account.");
    expect(
      modelPickerSignInRefreshMessage({
        status: "notReady",
        displayName: "Claude",
        error: null,
      }),
    ).toBe("Signed in, but Claude has not reported its models yet.");
    expect(
      modelPickerSignInRefreshMessage({
        status: "failed",
        displayName: "Claude",
        error: "timed out",
      }),
    ).toBe("Signed in, but Claude could not be re-checked: timed out");
  });
});

describe("ModelPickerSignInRefreshNotice", () => {
  it("offers Sign in, not Check again, when the probe says the account is not authenticated", () => {
    const html = renderToStaticMarkup(
      <ModelPickerSignInRefreshNotice
        displayName="Claude"
        status="unauthenticated"
        error={null}
        onRetry={() => {}}
        onSignIn={() => {}}
      />,
    );
    expect(html).toContain("Not authenticated. Sign in to use this account.");
    expect(html).toContain(">Sign in<");
    expect(html).not.toContain("Signed in");
    expect(html).not.toContain("Check again");
  });
});
