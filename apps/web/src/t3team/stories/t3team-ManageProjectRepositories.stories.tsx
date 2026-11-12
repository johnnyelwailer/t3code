import type { Meta, StoryObj } from "@storybook/react";
import { useState, type ComponentProps, type ReactNode } from "react";

import { resolveMainRepositoryUrl } from "~/t3team/hooks/t3team-linkedRepositoryMainSelection";
import { LinkedRepositoriesDialogView } from "~/t3team/components/t3team-LinkedRepositoriesDialogView";

const ALPHA = "https://github.com/acme/alpha";
const BETA = "https://github.com/acme/beta";
const GAMMA = "https://github.com/acme/gamma";

function Frame({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <div className={dark ? "dark" : undefined}>
      <div className="flex min-h-[640px] items-center justify-center bg-black/50 p-6">
        <div className="h-[560px] w-full max-w-3xl">{children}</div>
      </div>
    </div>
  );
}

type Args = ComponentProps<typeof LinkedRepositoriesDialogView> & { dark?: boolean };

function Interactive({ dark, ...args }: Args) {
  const [linkedUrls, setLinkedUrls] = useState(args.linkedUrls);
  const [main, setMain] = useState(args.mainRepositoryUrl);
  return (
    <Frame dark={dark}>
      <LinkedRepositoriesDialogView
        {...args}
        linkedUrls={linkedUrls}
        mainRepositoryUrl={main}
        dirty
        onMakeMain={(url) => setMain(url)}
        onUnlink={(url) => {
          const next = linkedUrls.filter((entry) => entry !== url);
          setMain(
            resolveMainRepositoryUrl({
              linkedUrls: next,
              currentMain: main,
              previousLinkedUrls: linkedUrls,
            }),
          );
          setLinkedUrls(next);
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

export const MakeMainError: Story = {
  args: {
    projectTitle: "Project Alpha",
    linkedUrls: [ALPHA, BETA],
    mainRepositoryUrl: ALPHA,
    mainError: { url: BETA, message: "Could not switch the main repository." },
    onRetryMain: () => {},
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
