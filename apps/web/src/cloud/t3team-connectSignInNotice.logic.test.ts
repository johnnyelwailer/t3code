import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  __resetConnectSignInNoticeDismissalForTests,
  dismissConnectSignInNoticeForSession,
  getConnectSignInNoticeView,
  isConnectSignInNoticeDismissedForSession,
  subscribeConnectSignInNoticeDismissal,
} from "./t3team-connectSignInNotice.logic";

const on = { enabled: true, dismissed: false };

describe("getConnectSignInNoticeView", () => {
  it("shows nothing until the server says a sign-in is required", () => {
    expect(getConnectSignInNoticeView(null, on)).toBeNull();
    expect(getConnectSignInNoticeView({ required: false, attempt: "idle" }, on)).toBeNull();
  });

  it("offers a click-to-sign-in notice for a linked environment without the sign-in", () => {
    const view = getConnectSignInNoticeView({ required: true, attempt: "idle" }, on);
    expect(view).toMatchObject({ key: "idle", title: "Sign in to T3 Connect", startsSignIn: true });
  });

  it("is suppressed entirely when the reminder setting is off", () => {
    for (const attempt of ["idle", "in_progress", "failed"] as const) {
      expect(
        getConnectSignInNoticeView(
          { required: true, attempt },
          { enabled: false, dismissed: false },
        ),
      ).toBeNull();
    }
  });

  it("respects a dismissal for idle and failed states", () => {
    const dismissed = { enabled: true, dismissed: true };
    expect(getConnectSignInNoticeView({ required: true, attempt: "idle" }, dismissed)).toBeNull();
    expect(getConnectSignInNoticeView({ required: true, attempt: "failed" }, dismissed)).toBeNull();
  });

  it("shows progress, not another sign-in, while the user's sign-in is open", () => {
    const view = getConnectSignInNoticeView({ required: true, attempt: "in_progress" }, on);
    expect(view).toMatchObject({ tone: "loading", startsSignIn: false });
  });

  it("after a failed attempt offers a manual retry only", () => {
    const view = getConnectSignInNoticeView({ required: true, attempt: "failed" }, on);
    expect(view).toMatchObject({ tone: "error", startsSignIn: true });
    expect(view?.description).toMatch(/Nothing retries on its own/);
  });
});

describe("session dismissal", () => {
  afterEach(() => __resetConnectSignInNoticeDismissalForTests());

  it("hides until the next start and notifies subscribers", () => {
    let calls = 0;
    const unsubscribe = subscribeConnectSignInNoticeDismissal(() => calls++);
    expect(isConnectSignInNoticeDismissedForSession()).toBe(false);
    dismissConnectSignInNoticeForSession();
    expect(isConnectSignInNoticeDismissedForSession()).toBe(true);
    expect(calls).toBe(1);
    unsubscribe();
  });
});
