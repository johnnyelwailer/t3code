import type { Meta, StoryObj } from "@storybook/react";
import { useState, type ComponentProps, type ReactNode } from "react";

import { resolveMainRepositoryUrl } from "~/t3team/hooks/t3team-linkedRepositoryMainSelection";
import {
  beginMainPersist,
  completeMainPersist,
  failMainPersist,
  initialMainOptimisticState,
  MAIN_REPOSITORY_PERSIST_ERROR,
  type MainRepositoryOptimisticState,
} from "~/t3team/hooks/t3team-mainRepositoryOptimistic";
import { LinkedRepositoriesDialogView } from "~/t3team/components/t3team-LinkedRepositoriesDialogView";

const ALPHA = "https://github.com/acme/alpha";
const BETA = "https://github.com/acme/beta";
const GAMMA = "https://github.com/acme/gamma";

function Frame({ children, dark = false }: { children: ReactNode; dark?: boolean | undefined }) {
  return (
    <div className={dark ? "dark" : undefined}>
      <div className="flex min-h-[640px] items-center justify-center bg-black/50 p-6">
        <div className="h-[560px] w-full max-w-3xl">{children}</div>
      </div>
    </div>
  );
}

type Args = Omit<
  ComponentProps<typeof LinkedRepositoriesDialogView>,
  "onMakeMain" | "onUnlink" | "onClose" | "onSave"
> & {
  dark?: boolean | undefined;
  persistOutcome?: "success" | "failure" | undefined;
};

function Interactive({ dark, persistOutcome = "success", ...args }: Args) {
  const [linkedUrls, setLinkedUrls] = useState(args.linkedUrls);
  const [state, setState] = useState<MainRepositoryOptimisticState>(() =>
    initialMainOptimisticState(args.mainRepositoryUrl),
  );
  const runPersist = (nextUrl: string | null, revertOnFailure: boolean) => {
    setState((current) => beginMainPersist(current, nextUrl, revertOnFailure));
    window.setTimeout(() => {
      setState((current) =>
        persistOutcome === "failure"
          ? failMainPersist(current)
          : completeMainPersist(current, nextUrl),
      );
    }, 600);
  };
  const retry = () => {
    if (!state.error) return;
    runPersist(state.error.url, state.revertOnFailure);
  };
  return (
    <Frame dark={dark}>
      <LinkedRepositoriesDialogView
        {...args}
        linkedUrls={linkedUrls}
        mainRepositoryUrl={state.mainUrl}
        dirty
        pendingMainUrl={state.pendingUrl}
        mainPending={state.pendingUrl !== undefined}
        mainError={state.error}
        onMakeMain={(url) => runPersist(url, true)}
        onRetryMain={retry}
        onUnlink={(url) => {
          const next = linkedUrls.filter((entry) => entry !== url);
          const newMain = resolveMainRepositoryUrl({
            linkedUrls: next,
            currentMain: state.mainUrl,
            previousLinkedUrls: linkedUrls,
          });
          setLinkedUrls(next);
          if (newMain === state.mainUrl) return;
          const previousStillLinked =
            state.committedUrl !== null && next.includes(state.committedUrl);
          runPersist(newMain, previousStillLinked);
        }}
        onClose={() => {}}
        onSave={() => {}}
      />
    </Frame>
  );
}

const meta = {
  title: "T3Team/Linked repositories",
  parameters: { layout: "fullscreen" },
  render: (args) => <Interactive {...args} />,
} satisfies Meta<typeof Interactive>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoRepositories: Story = {
  args: { projectTitle: "Project Alpha", linkedUrls: [], mainRepositoryUrl: null },
};

export const OneRepository: Story = {
  args: { projectTitle: "Project Alpha", linkedUrls: [ALPHA], mainRepositoryUrl: ALPHA },
};

export const SeveralRepositories: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA, GAMMA],
    mainRepositoryUrl: ALPHA,
  },
};

export const NoMainExistingProject: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA],
    mainRepositoryUrl: null,
  },
};

export const AdoptedWorkspace: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA],
    mainRepositoryUrl: null,
    adoptedWorkspace: true,
  },
};

export const MakeMainPending: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA],
    mainRepositoryUrl: BETA,
    pendingMainUrl: BETA,
    mainPending: true,
  },
  // Static snapshot of the pending row: skip the interactive persist so Saving… stays visible.
  render: (args) => (
    <Frame>
      <LinkedRepositoriesDialogView
        projectTitle={args.projectTitle}
        linkedUrls={args.linkedUrls}
        mainRepositoryUrl={args.mainRepositoryUrl}
        pendingMainUrl={args.pendingMainUrl}
        mainPending={args.mainPending}
        onMakeMain={() => {}}
        onClose={() => {}}
        onSave={() => {}}
      />
    </Frame>
  ),
};

export const MakeMainError: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA],
    mainRepositoryUrl: ALPHA,
    mainError: { url: BETA, message: MAIN_REPOSITORY_PERSIST_ERROR },
    onRetryMain: () => {},
  },
  render: (args) => (
    <Frame>
      <LinkedRepositoriesDialogView
        projectTitle={args.projectTitle}
        linkedUrls={args.linkedUrls}
        mainRepositoryUrl={args.mainRepositoryUrl}
        mainError={args.mainError}
        onMakeMain={() => {}}
        onRetryMain={args.onRetryMain}
        onClose={() => {}}
        onSave={() => {}}
      />
    </Frame>
  ),
};

export const MakeMainRetry: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA],
    mainRepositoryUrl: ALPHA,
    persistOutcome: "failure",
  },
};

export const SeveralRepositoriesDark: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA, GAMMA],
    mainRepositoryUrl: ALPHA,
    dark: true,
  },
};

export const NoMainExistingProjectDark: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA],
    mainRepositoryUrl: null,
    dark: true,
  },
};
