import type { AccountStatus, CloudSession, ServerProvider } from "@t3tools/contracts";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import {
  BotIcon,
  CheckIcon,
  CloudIcon,
  FolderGit2Icon,
  LockIcon,
  SmartphoneIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";

import { AccountSignInCard } from "~/components/account/t3team-AccountSignInCard";
import { ModelPickerProviderConnectPanel } from "~/components/chat/t3team-ModelPickerProviderConnectPanel";
import { OnboardingReadyAgents } from "~/components/onboarding/t3team-OnboardingReadyAgents";
import { JiraConnectionSettings } from "~/components/settings/t3team-JiraConnectionSettings";
import { CloudSessionSetupCard } from "~/cloud/t3team-CloudSessionSetupCard";
import { deriveProviderInstanceEntries } from "~/providerInstances";
import type { AtlassianAccountStatus } from "~/t3team/backend/t3team-atlassianAccountStatus";
import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";
import { GitHubSignInView } from "~/t3team/components/t3team-GitHubSignInAction";
import { RepositoryPicker } from "~/t3team/components/t3team-RepositoryPicker";
import { Button } from "~/t3team/components/ui/t3team-button";
import { T3TeamRichChoice } from "~/t3team/rich-choice/t3team-RichChoice";
import type { RichChoiceOption } from "~/t3team/rich-choice/t3team-richChoice.logic";
import { CreateProjectChooseStep } from "~/t3team/t3team-CreateProjectChooseStep";
import { CreateProjectConnectView } from "~/t3team/t3team-CreateProjectConnectPanel";

import {
  AddMoreAgents,
  LockedNote,
  SkippedNote,
  WelcomeRow,
} from "./t3team-NexiWelcomeLayout.fixtures";
import type {
  AccountStoryState,
  AgentsStoryState,
  CloudPhoneStoryState,
  GitHubStoryState,
  JiraStoryState,
  ProjectStoryState,
} from "./t3team-NexiWelcomeScenario.fixtures";
import {
  catalogState,
  chooseProps,
  connectFixture,
  discovery,
  nexploreProjects,
} from "../t3team-createProjectStoryFixtures";

const noop = () => {};

export function accountStatus(
  auth: AccountStatus["auth"],
  lastError: string | null = null,
): AccountStatus {
  return { id: "nexplore", label: "Nexplore", auth, lastError };
}

export function readyNexploreProvider(): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make("nexplore-default"),
    driver: ProviderDriverKind.make("nexplore"),
    displayName: "Nexplore AI",
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-11-10T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
}

export function providerEntry(driver: string, displayName: string, installed = true) {
  const provider: ServerProvider = {
    instanceId: ProviderInstanceId.make(driver),
    driver: ProviderDriverKind.make(driver),
    displayName,
    enabled: true,
    installed,
    version: installed ? "1.0.0" : null,
    status: "error",
    auth: { status: "unknown" },
    checkedAt: "2026-11-10T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
  return deriveProviderInstanceEntries([provider])[0]!;
}

export const ROLE_OPTIONS: readonly RichChoiceOption[] = [
  {
    id: "requirements-product",
    title: "Requirements & Product",
    tag: "RE / PO",
    body: "Backlog quality end to end: readiness gates and stakeholder-ready framing.",
    chips: ["Lens: backlog health", "Style: short, guided"],
  },
  {
    id: "delivery-lead",
    title: "Delivery Lead",
    tag: "DL",
    body: "Flow, risks and commitments before they cost a sprint.",
    chips: ["Lens: flow and risk", "Style: concise"],
  },
  {
    id: "engineer",
    title: "Engineer",
    tag: "DEV",
    body: "Implementation first: plans, diffs and tests.",
    chips: ["Lens: code and diffs", "Style: technical"],
  },
];

export const connectedJira: AtlassianAccountStatus = {
  id: "cloud-nexplore",
  provider: "atlassian",
  label: "Philip Jonientz",
  accountUrl: "https://nexplore.atlassian.net",
  status: "connected",
  needsReconnect: false,
  lastSyncAt: new Date().toISOString(),
};

export function JiraSettingsFrame({
  accounts,
}: {
  readonly accounts: ReadonlyArray<AtlassianAccountStatus>;
}) {
  const mock = createMockBackend();
  const backend = {
    ...mock,
    atlassian: {
      ...mock.atlassian,
      listAccountStatuses: async () => accounts,
      disconnectAccount: async () => {},
    },
  };
  return (
    <BackendProvider backend={backend}>
      <JiraConnectionSettings />
    </BackendProvider>
  );
}

function cloudSession(overrides: Partial<CloudSession> = {}): CloudSession {
  return {
    sessionId: "session-welcome",
    providerKind: "github_actions",
    phase: "preparing",
    elapsedSeconds: 38,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim · 12 GB · 4 cores",
    failureReason: null,
    detailsUrl: null,
    ...overrides,
  };
}

export function AccountBlock({ state }: { readonly state: AccountStoryState }) {
  if (state === "skipped") {
    return <SkippedNote>Skipped — reopen in Settings → About.</SkippedNote>;
  }
  if (state === "signedIn") {
    return (
      <WelcomeRow
        icon={<UserIcon className="size-4" />}
        trailing={<CheckIcon className="size-4 text-success-foreground" />}
      >
        <p className="text-sm font-medium">Signed in to Nexplore</p>
        <p className="text-xs text-muted-foreground">Philip Jonientz · Entra</p>
      </WelcomeRow>
    );
  }
  if (state === "waitingForCode") {
    return (
      <AccountSignInCard
        account={accountStatus({
          _tag: "SigningIn",
          userCode: "LD5PUZ45H",
          verificationUri: "https://id.example.com/device",
          expiresAtMs: Date.now() + 900_000,
        })}
        purpose="to use Nexi Work cloud sessions and phone"
        onSignIn={noop}
        onOpenVerification={noop}
      />
    );
  }
  if (state === "serverUnreachable") {
    return (
      <AccountSignInCard
        account={accountStatus({ _tag: "SignedOut" })}
        purpose="to use Nexi Work cloud sessions and phone"
        error="Could not reach this machine's server: TypeError: Failed to fetch"
        onSignIn={noop}
        onOpenVerification={noop}
      />
    );
  }
  return (
    <div className="space-y-2">
      <AccountSignInCard
        account={accountStatus({ _tag: "SignedOut" })}
        purpose="to use Nexi Work cloud sessions and phone"
        onSignIn={noop}
        onOpenVerification={noop}
      />
      <SkippedNote>Recommended and skippable.</SkippedNote>
    </div>
  );
}

export function AgentsBlock({ state }: { readonly state: AgentsStoryState }) {
  const addMore = (
    <AddMoreAgents
      open={state === "none" || state === "addMoreOpen" || state === "unreachable"}
      emptyLabel={state === "none" ? "Set up an agent" : "Add more agents"}
    >
      <ModelPickerProviderConnectPanel
        entry={providerEntry("claudeAgent", "Claude Code")}
        tool="claude"
        readiness="needsAuth"
      />
      <ModelPickerProviderConnectPanel
        entry={providerEntry("codex", "Codex", false)}
        tool="codex"
        readiness="needsInstall"
      />
      <WelcomeRow
        icon={<BotIcon className="size-4" />}
        trailing={
          <Button size="sm" variant="outline">
            Details
          </Button>
        }
      >
        <p className="text-sm font-medium">Cursor</p>
        <p className="text-xs text-muted-foreground">
          Open Settings → Providers to connect Cursor.
        </p>
      </WelcomeRow>
    </AddMoreAgents>
  );

  if (state === "ready") {
    return (
      <div className="space-y-1">
        <OnboardingReadyAgents providers={[readyNexploreProvider()]} excludeDrivers={[]} />
        {addMore}
      </div>
    );
  }
  if (state === "unreachable") {
    return (
      <div className="space-y-2">
        <WelcomeRow
          icon={<BotIcon className="size-4" />}
          trailing={
            <Button size="sm" variant="outline">
              Manual setup
            </Button>
          }
        >
          <p className="text-sm font-medium">Nexplore AI</p>
          <p className="text-xs text-muted-foreground">
            Could not reach Nexplore AI on this computer. Use the manual path, or add Claude / Codex
            below.
          </p>
        </WelcomeRow>
        {addMore}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <WelcomeRow icon={<BotIcon className="size-4" />}>
        <p className="text-sm text-muted-foreground">No agents found yet on this computer.</p>
      </WelcomeRow>
      {addMore}
    </div>
  );
}

export function RoleBlock() {
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <T3TeamRichChoice
        prompt="Choose your role"
        options={ROLE_OPTIONS}
        selectedIds={last ? [last] : []}
        onChoose={([id]) => setLast(id ?? null)}
      />
      <SkippedNote>
        Behind a feature toggle (off by default). Shown here with the toggle on.
      </SkippedNote>
    </div>
  );
}

export function JiraBlock({ state }: { readonly state: JiraStoryState }) {
  if (state === "skipped") {
    return <SkippedNote>Skipped — connect later in Settings → Jira.</SkippedNote>;
  }
  if (state === "connected") {
    return <JiraSettingsFrame accounts={[connectedJira]} />;
  }
  if (state === "tokenFallback") {
    return <CreateProjectConnectView connect={connectFixture()} initialShowTokenForm />;
  }
  return <CreateProjectConnectView connect={connectFixture()} />;
}

export function ProjectBlock({ state }: { readonly state: ProjectStoryState }) {
  const [linked, setLinked] = useState<ReadonlyArray<string>>([]);
  if (state === "skipped") {
    return <SkippedNote>Skipped — create a project from Home anytime.</SkippedNote>;
  }
  if (state === "chosen") {
    return (
      <WelcomeRow
        icon={<FolderGit2Icon className="size-4" />}
        trailing={<CheckIcon className="size-4 text-success-foreground" />}
      >
        <p className="text-sm font-medium">IES NG</p>
        <p className="text-xs text-muted-foreground">nexplore.atlassian.net · hive/ies-alarm</p>
      </WelcomeRow>
    );
  }
  if (state === "choosing") {
    return (
      <div className="space-y-4">
        <CreateProjectChooseStep
          {...chooseProps({
            catalogState: catalogState({ catalog: nexploreProjects }),
          })}
        />
        <RepositoryPicker
          discovery={discovery()}
          linkedUrls={linked}
          onToggle={(url) =>
            setLinked((current) =>
              current.includes(url) ? current.filter((entry) => entry !== url) : [...current, url],
            )
          }
          onLinkMany={(urls) => setLinked((current) => [...new Set([...current, ...urls])])}
        />
      </div>
    );
  }
  return (
    <WelcomeRow
      icon={<FolderGit2Icon className="size-4" />}
      trailing={
        <Button size="sm" variant="outline">
          Set up
        </Button>
      }
    >
      <p className="text-sm font-medium">First project</p>
      <p className="text-xs text-muted-foreground">Pick a Jira project and link a repository.</p>
    </WelcomeRow>
  );
}

export function GitHubBlock({ state }: { readonly state: GitHubStoryState }) {
  if (state === "skipped") {
    return <SkippedNote>Skipped — sign in from Settings → GitHub.</SkippedNote>;
  }
  if (state === "bothSignedIn") {
    return (
      <div className="space-y-3">
        <GitHubSignInView
          host="nexplore.ghe.com"
          state={{ tool: "gh", phase: "connected", hostname: "nexplore.ghe.com", account: "pj" }}
          onStart={noop}
          onCancel={noop}
        />
        <GitHubSignInView
          host="github.com"
          state={{ tool: "gh", phase: "connected", hostname: "github.com", account: "djangal" }}
          onStart={noop}
          onCancel={noop}
        />
      </div>
    );
  }
  if (state === "gheAwaiting") {
    return (
      <div className="space-y-3">
        <GitHubSignInView
          host="nexplore.ghe.com"
          state={{
            tool: "gh",
            phase: "awaiting-open",
            hostname: "nexplore.ghe.com",
            url: "https://nexplore.ghe.com/login/device",
            displayCode: "0749-5FAA",
          }}
          onStart={noop}
          onCancel={noop}
        />
        <GitHubSignInView host="github.com" state={undefined} onStart={noop} onCancel={noop} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <GitHubSignInView host="nexplore.ghe.com" state={undefined} onStart={noop} onCancel={noop} />
      <GitHubSignInView host="github.com" state={undefined} onStart={noop} onCancel={noop} />
    </div>
  );
}

export function CloudPhoneBlock({
  state,
  entraSignedIn,
}: {
  readonly state: CloudPhoneStoryState;
  readonly entraSignedIn: boolean;
}) {
  if (state === "skipped") {
    return <SkippedNote>Skipped — enable cloud sessions in Settings → Features.</SkippedNote>;
  }
  if (state === "locked" || !entraSignedIn) {
    return (
      <LockedNote>
        <div className="flex items-start gap-2">
          <LockIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Needs Nexplore sign-in</p>
            <p className="mt-0.5 text-xs">
              Cloud sessions and phone setup unlock after you sign in with your Nexplore account
              above.
            </p>
          </div>
        </div>
      </LockedNote>
    );
  }
  if (state === "optIn") {
    return (
      <div className="space-y-3">
        <WelcomeRow
          icon={<CloudIcon className="size-4" />}
          trailing={
            <Button size="sm" variant="outline">
              Turn on
            </Button>
          }
        >
          <p className="text-sm font-medium">Cloud sessions</p>
          <p className="text-xs text-muted-foreground">
            Run agents on a remote machine when this one is busy.
          </p>
        </WelcomeRow>
        <WelcomeRow
          icon={<SmartphoneIcon className="size-4" />}
          trailing={
            <Button size="sm" variant="outline">
              Set up
            </Button>
          }
        >
          <p className="text-sm font-medium">Phone</p>
          <p className="text-xs text-muted-foreground">
            Optional. Continue work from the mobile app.
          </p>
        </WelcomeRow>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <CloudSessionSetupCard
        facts={{ session: cloudSession({}), machineConnected: false }}
        frozenElapsedSeconds={38}
      />
      <WelcomeRow
        icon={<SmartphoneIcon className="size-4" />}
        trailing={<CheckIcon className="size-4 text-success-foreground" />}
      >
        <p className="text-sm font-medium">Phone</p>
        <p className="text-xs text-muted-foreground">Ready — same Nexplore account on the app.</p>
      </WelcomeRow>
    </div>
  );
}
