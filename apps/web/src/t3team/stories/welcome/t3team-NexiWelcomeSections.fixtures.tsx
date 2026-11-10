import type { AccountStatus } from "@t3tools/contracts";
import { CloudIcon, SmartphoneIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ClaudeAI, CursorIcon, OpenAI } from "~/components/Icons";
import { NexploreAI } from "~/components/t3team-NexploreAIIcon";
import { getSourceControlPresentationForKind } from "~/sourceControlPresentation";
import { JiraIcon } from "~/t3team/components/brand/t3team-AtlassianLogos";
import { T3TeamRichChoice } from "~/t3team/rich-choice/t3team-RichChoice";
import type { RichChoiceOption } from "~/t3team/rich-choice/t3team-richChoice.logic";

import {
  PrimaryAction,
  SecondaryAction,
  ServiceMark,
  ShowMore,
  StatusLabel,
  WelcomeItem,
} from "./t3team-NexiWelcomeLayout.fixtures";
import type {
  AccountStoryState,
  AgentsStoryState,
  CloudPhoneStoryState,
  GitHubStoryState,
  JiraStoryState,
} from "./t3team-NexiWelcomeScenario.fixtures";

const GitHubIcon = getSourceControlPresentationForKind("github").Icon;
const noop = () => {};

export function accountStatus(
  auth: AccountStatus["auth"],
  lastError: string | null = null,
): AccountStatus {
  return { id: "nexplore", label: "Nexplore", auth, lastError };
}

const ROLE_OPTIONS: readonly RichChoiceOption[] = [
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

function AgentItem({
  mark,
  markLabel,
  title,
  description,
  status,
  action,
}: {
  readonly mark: ReactNode;
  readonly markLabel: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly status?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <WelcomeItem
      mark={<ServiceMark label={markLabel}>{mark}</ServiceMark>}
      title={title}
      description={description}
      status={status}
      action={action}
    />
  );
}

export function AccountBlock({ state }: { readonly state: AccountStoryState }) {
  const mark = (
    <ServiceMark label="Nexplore">
      <NexploreAI aria-hidden />
    </ServiceMark>
  );

  if (state === "skipped") {
    return (
      <WelcomeItem
        mark={mark}
        title="Nexplore"
        status={<StatusLabel status="skipped" label="Skipped" />}
      />
    );
  }
  if (state === "signedIn") {
    return (
      <WelcomeItem
        mark={mark}
        title="Nexplore"
        description="Philip Jonientz"
        status={<StatusLabel status="connected" label="Signed in" />}
      />
    );
  }
  if (state === "waitingForCode") {
    return (
      <WelcomeItem
        mark={mark}
        title="Nexplore"
        description={
          <span className="font-mono font-medium tracking-wider text-foreground">LD5PUZ45H</span>
        }
        status={<StatusLabel status="pending" label="Waiting" />}
        action={<PrimaryAction onClick={noop}>Copy code & open</PrimaryAction>}
      />
    );
  }
  if (state === "serverUnreachable") {
    return (
      <WelcomeItem
        mark={mark}
        title="Nexplore"
        description="Could not reach this machine's server."
        action={<SecondaryAction onClick={noop}>Retry</SecondaryAction>}
      />
    );
  }
  return (
    <WelcomeItem
      mark={mark}
      title="Nexplore"
      action={<PrimaryAction onClick={noop}>Sign in</PrimaryAction>}
    />
  );
}

export function AgentsBlock({ state }: { readonly state: AgentsStoryState }) {
  const extras = (
    <ShowMore
      open={state === "none" || state === "addMoreOpen" || state === "unreachable"}
      label={state === "none" ? "Set up an agent" : "Add more agents"}
    >
      <AgentItem
        mark={<ClaudeAI aria-hidden />}
        markLabel="Claude Code"
        title="Claude Code"
        action={<SecondaryAction onClick={noop}>Connect</SecondaryAction>}
      />
      <AgentItem
        mark={<OpenAI aria-hidden />}
        markLabel="Codex"
        title="Codex"
        action={<SecondaryAction onClick={noop}>Install</SecondaryAction>}
      />
      <AgentItem
        mark={<CursorIcon aria-hidden />}
        markLabel="Cursor"
        title="Cursor"
        action={<SecondaryAction onClick={noop}>Open</SecondaryAction>}
      />
    </ShowMore>
  );

  if (state === "ready") {
    return (
      <>
        <AgentItem
          mark={<NexploreAI aria-hidden />}
          markLabel="Nexplore AI"
          title="Nexplore AI"
          status={<StatusLabel status="ready" label="Ready" />}
        />
        {extras}
      </>
    );
  }
  if (state === "unreachable") {
    return (
      <>
        <AgentItem
          mark={<NexploreAI aria-hidden />}
          markLabel="Nexplore AI"
          title="Nexplore AI"
          description="Could not reach Nexplore AI."
          action={<SecondaryAction onClick={noop}>Manual setup</SecondaryAction>}
        />
        {extras}
      </>
    );
  }
  return extras;
}

export function RoleBlock() {
  const [last, setLast] = useState<string | null>(null);
  return (
    <div className="py-1">
      <T3TeamRichChoice
        prompt="Choose your role"
        options={ROLE_OPTIONS}
        selectedIds={last ? [last] : []}
        onChoose={([id]) => setLast(id ?? null)}
      />
    </div>
  );
}

export function JiraBlock({ state }: { readonly state: JiraStoryState }) {
  const mark = (
    <ServiceMark label="Jira">
      <JiraIcon aria-hidden className="size-5" />
    </ServiceMark>
  );

  if (state === "skipped") {
    return (
      <WelcomeItem
        mark={mark}
        title="Jira"
        status={<StatusLabel status="skipped" label="Skipped" />}
      />
    );
  }
  if (state === "connected") {
    return (
      <WelcomeItem
        mark={mark}
        title="Jira"
        description="nexplore.atlassian.net · Philip Jonientz"
        status={<StatusLabel status="connected" label="Connected" />}
      />
    );
  }
  if (state === "tokenFallback") {
    return (
      <WelcomeItem
        mark={mark}
        title="Jira"
        action={<PrimaryAction onClick={noop}>Connect with token</PrimaryAction>}
      />
    );
  }
  return (
    <WelcomeItem
      mark={mark}
      title="Jira"
      action={<PrimaryAction onClick={noop}>Connect</PrimaryAction>}
    />
  );
}

export function GitHubBlock({ state }: { readonly state: GitHubStoryState }) {
  const mark = (label: string) => (
    <ServiceMark label={label}>
      <GitHubIcon aria-hidden className="size-5" />
    </ServiceMark>
  );

  if (state === "skipped") {
    return (
      <WelcomeItem
        mark={mark("GitHub")}
        title="GitHub"
        status={<StatusLabel status="skipped" label="Skipped" />}
      />
    );
  }

  const ghe =
    state === "bothSignedIn" ? (
      <WelcomeItem
        mark={mark("GitHub Enterprise")}
        title="nexplore.ghe.com"
        description="pj"
        status={<StatusLabel status="connected" label="Signed in" />}
      />
    ) : state === "gheAwaiting" ? (
      <WelcomeItem
        mark={mark("GitHub Enterprise")}
        title="nexplore.ghe.com"
        description={
          <span className="font-mono font-medium tracking-wider text-foreground">0749-5FAA</span>
        }
        status={<StatusLabel status="pending" label="Waiting" />}
        action={<PrimaryAction onClick={noop}>Copy code & open</PrimaryAction>}
      />
    ) : (
      <WelcomeItem
        mark={mark("GitHub Enterprise")}
        title="nexplore.ghe.com"
        action={<SecondaryAction onClick={noop}>Sign in</SecondaryAction>}
      />
    );

  const dotcom =
    state === "bothSignedIn" ? (
      <WelcomeItem
        mark={mark("GitHub")}
        title="github.com"
        description="djangal"
        status={<StatusLabel status="connected" label="Signed in" />}
      />
    ) : (
      <WelcomeItem
        mark={mark("GitHub")}
        title="github.com"
        action={<SecondaryAction onClick={noop}>Sign in</SecondaryAction>}
      />
    );

  return (
    <>
      {ghe}
      {dotcom}
    </>
  );
}

export function CloudPhoneBlock({
  state,
  entraSignedIn,
}: {
  readonly state: CloudPhoneStoryState;
  readonly entraSignedIn: boolean;
}) {
  const cloudMark = (
    <ServiceMark label="Cloud">
      <CloudIcon className="size-5" aria-hidden />
    </ServiceMark>
  );
  const phoneMark = (
    <ServiceMark label="Phone">
      <SmartphoneIcon className="size-5" aria-hidden />
    </ServiceMark>
  );

  if (state === "skipped") {
    return (
      <WelcomeItem
        mark={cloudMark}
        title="Cloud sessions"
        status={<StatusLabel status="skipped" label="Skipped" />}
      />
    );
  }
  if (state === "locked" || !entraSignedIn) {
    return (
      <>
        <WelcomeItem
          mark={cloudMark}
          title="Cloud sessions"
          status={<StatusLabel status="locked" label="Needs Nexplore sign-in" />}
        />
        <WelcomeItem
          mark={phoneMark}
          title="Phone"
          status={<StatusLabel status="locked" label="Needs Nexplore sign-in" />}
        />
      </>
    );
  }
  if (state === "optIn") {
    return (
      <>
        <WelcomeItem
          mark={cloudMark}
          title="Cloud sessions"
          action={<SecondaryAction onClick={noop}>Turn on</SecondaryAction>}
        />
        <WelcomeItem
          mark={phoneMark}
          title="Phone"
          action={<SecondaryAction onClick={noop}>Set up</SecondaryAction>}
        />
      </>
    );
  }
  return (
    <>
      <WelcomeItem
        mark={cloudMark}
        title="Cloud sessions"
        status={<StatusLabel status="pending" label="Setting up" />}
      />
      <WelcomeItem
        mark={phoneMark}
        title="Phone"
        status={<StatusLabel status="ready" label="Ready" />}
      />
    </>
  );
}
