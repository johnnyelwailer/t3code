/**
 * The welcome wizard's work-source steps (`FIRST_RUN_WORK_SOURCE`). `/welcome` sits outside the
 * Team shell, so the steps bring their own backend; the Jira and project steps share one catalog
 * read, so a sign-in on the first shows its projects on the second.
 */
import { useState } from "react";

import { BackendProvider, createT3Backend } from "~/t3team/backend/t3team-index";
import { useJiraProjectCatalogState } from "~/t3team/hooks/t3team-useJiraProjectCatalogState";
import { resolveWsBaseUrl } from "~/t3team/t3team-route-surface-wsUrl";

import { WelcomeFirstProjectStep } from "./t3team-WelcomeFirstProjectStep";
import { WelcomeGitHubStep } from "./t3team-WelcomeGitHubStep";
import { WelcomeJiraStep } from "./t3team-WelcomeJiraStep";
import type { T3TeamWorkSourceStep } from "./t3team-welcomeWizardFlow";

export interface WelcomeWorkSourceStepsProps {
  readonly step: T3TeamWorkSourceStep;
  readonly onContinue: () => void;
  readonly onFinish: () => void;
}

export function T3TeamWelcomeWorkSourceSteps(props: WelcomeWorkSourceStepsProps) {
  const [backend] = useState(() => createT3Backend(resolveWsBaseUrl()));
  return (
    <BackendProvider backend={backend}>
      <WorkSourceStep {...props} />
    </BackendProvider>
  );
}

function WorkSourceStep({ step, onContinue, onFinish }: WelcomeWorkSourceStepsProps) {
  const catalog = useJiraProjectCatalogState();
  if (step === "jira") return <WelcomeJiraStep catalog={catalog} onContinue={onContinue} />;
  if (step === "first-project") {
    return <WelcomeFirstProjectStep catalog={catalog} onContinue={onContinue} />;
  }
  return <WelcomeGitHubStep onFinish={onFinish} />;
}
