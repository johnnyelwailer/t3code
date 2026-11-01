import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

const state = vi.hoisted(() => ({ flag: false, listen: vi.fn(() => () => true) }));

vi.mock("@t3tools/client-runtime/state/thread-answers", () => ({
  onThreadAnswersResolved: state.listen,
}));
vi.mock("~/t3team/t3team-useFeatureFlag", () => ({ useFeatureFlag: () => state.flag }));
vi.mock("~/connection/t3team-brokerSessionRead", () => ({ readSessionsForBrokerAttach: vi.fn() }));
vi.mock("~/rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("~/state/environments", () => ({ readPrimaryEnvironmentId: () => null }));
vi.mock("~/state/t3team-cloudSessions", () => ({ cloudSessionListAtom: {} }));
vi.mock("../components/ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("./t3team-desktopRouteGrant", () => ({ postDesktopRouteGrant: vi.fn() }));

import { DesktopRouteAnswerObserver } from "./t3team-DesktopRouteAnswerObserver";

describe("DesktopRouteAnswerObserver", () => {
  it("listens to nothing while AGENTS_DESKTOP_ROUTE is off", async () => {
    state.listen.mockClear();
    state.flag = false;
    await using _screen = await render(<DesktopRouteAnswerObserver />, { router: false });
    expect(state.listen).not.toHaveBeenCalled();
  });

  it("listens while the flag is on", async () => {
    state.listen.mockClear();
    state.flag = true;
    await using _screen = await render(<DesktopRouteAnswerObserver />, { router: false });
    expect(state.listen).toHaveBeenCalledOnce();
  });
});
