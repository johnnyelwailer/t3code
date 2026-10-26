import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

const mocks = vi.hoisted(() => ({ enabledCalls: [] as boolean[] }));

vi.mock("~/state/t3team-cloudSessions", () => ({
  useCloudSessions: (enabled: boolean) => {
    mocks.enabledCalls.push(enabled);
    return { sessions: [] };
  },
}));
vi.mock("~/state/entities", () => ({ useProject: () => null, useProjects: () => [] }));
vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({ environments: [] }),
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("./t3team-useCloudSessionProjectFollow", () => ({
  useCloudSessionProjectKey: () => null,
}));

import {
  clearCloudSessionTarget,
  selectCloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";
import { useCloudSessionOwnProject } from "./t3team-useCloudSessionOwnProject";

function Probe({ scopeKey }: { scopeKey: string }) {
  useCloudSessionOwnProject(scopeKey, null);
  return null;
}

async function listAskedFor(scopeKey: string): Promise<boolean> {
  mocks.enabledCalls.length = 0;
  await using _screen = await render(<Probe scopeKey={scopeKey} />, { router: false });
  return mocks.enabledCalls.at(-1) === true;
}

/** The composer's Run on target, removed again when the test ends. */
function targetSession(scopeKey: string): Disposable {
  selectCloudSessionTarget({ scopeKey, sessionId: "s-1", label: "machine" });
  return { [Symbol.dispose]: () => clearCloudSessionTarget(scopeKey) };
}

describe("useCloudSessionOwnProject list demand", () => {
  it("does not ask for the list for a composer with no Run on target", async () => {
    expect(await listAskedFor("draft-a")).toBe(false);
  });

  it("asks for it once the composer has a cloud session as its target", async () => {
    using _target = targetSession("draft-a");
    expect(await listAskedFor("draft-a")).toBe(true);
  });
});
