/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as the dialog view tests. */
import { act, memo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vite-plus/test";

import { ManageProjectRepositoriesDialog } from "~/t3team/t3team-ManageProjectRepositoriesDialog";
import { renderCounter } from "~/test/t3team-renderCounter";
import type { ProjectShellProject } from "@t3tools/project-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("~/t3team/components/ui/t3team-card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
}));
vi.mock("~/t3team/components/t3team-RepositoryPicker", () => ({
  RepositoryPicker: () => <div data-testid="picker" />,
}));
vi.mock("~/t3team/hooks/t3team-useSaveProjectRepositories", () => ({
  useSaveProjectRepositories: () => ({
    save: async () => {},
    saving: false,
    saved: null,
    saveError: undefined,
    unchangedSinceSave: true,
    syncView: { visible: false, steps: [], hide: () => {} },
  }),
}));
vi.mock("~/t3team/hooks/t3team-persistMainRepository", () => ({
  usePersistMainRepository: ({ initialMainUrl }: { initialMainUrl: string | null }) => ({
    state: { mainUrl: initialMainUrl, pendingUrl: null, error: null },
    persist: async () => {},
    setLocal: () => {},
    retry: () => {},
  }),
}));
vi.mock("~/t3team/hooks/t3team-useLinkedRepositorySyncStatus", () => ({
  useLinkedRepositorySyncStatus: () => ({ byUrl: new Map(), overall: "idle", syncNow: () => {} }),
}));
vi.mock("~/t3team/hooks/t3team-useGitHubRepositoryDiscovery", () => ({
  useGitHubRepositoryDiscovery: () => ({ repositories: [], loading: false }),
}));
vi.mock("~/t3team/hooks/t3team-useLinkedRepositoryBranches", () => ({
  useLinkedRepositoryBranches: () => ({
    branches: new Map(),
    byUrl: new Map(),
    changed: false,
    branchFor: () => "",
    setBranch: () => {},
  }),
}));
vi.mock("~/t3team/t3team-serverState", () => ({
  useServerConfig: () => ({ mainRepository: true }),
}));
vi.mock("~/t3team/t3team-useFeatureFlag", () => ({
  readServerFeatureFlag: () => true,
  readServerFeatureFlagOr: (_c: unknown, _n: string, fallback: boolean) => fallback,
}));
vi.mock("~/t3team/components/t3team-LinkedRepositorySyncStatusLine", () => ({
  LinkedRepositorySyncStatusLine: () => null,
}));
vi.mock("~/t3team/components/t3team-LinkedRepositoryBranchControl", () => ({
  LinkedRepositoryBranchControl: () => null,
}));

const project = {
  id: "proj-1",
  title: "Project Alpha",
  workspace: { rootPath: "/ws" },
  source: {},
  settings: { repositories: [{ url: "https://github.com/acme/alpha", isMain: true }] },
} as unknown as ProjectShellProject;

const counter = renderCounter();
const stableOnClose = () => {};
const stableOnUpdated = () => {};

const CountingDialog = memo(function CountingDialog(props: {
  rowId: string;
  project: ProjectShellProject;
}) {
  counter.count(props.rowId);
  return (
    <ManageProjectRepositoriesDialog
      project={props.project}
      onClose={stableOnClose}
      onProjectUpdated={stableOnUpdated}
    />
  );
});

function Parent({ tick }: { tick: number }) {
  return (
    <div data-tick={tick}>
      <CountingDialog rowId="dialog" project={project} />
    </div>
  );
}

describe("ManageProjectRepositoriesDialog re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("mounts once and does not re-render when an unrelated parent tick changes", async () => {
    function Interactive() {
      const [tick, setTick] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setTick((n) => n + 1)}>
            tick
          </button>
          <Parent tick={tick} />
        </div>
      );
    }
    await act(async () => {
      root.render(<Interactive />);
    });
    counter.expectRerendered({ dialog: 1 });
    counter.reset();
    await act(async () => {
      container.querySelector("button")?.click();
    });
    counter.expectRerendered({});
  });
});
