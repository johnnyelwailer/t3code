import { Building2 } from "lucide-react";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import { Button } from "~/t3work/components/ui/t3work-button";
import { Input } from "~/t3work/components/ui/t3work-input";
import { Skeleton } from "~/t3work/components/ui/t3work-skeleton";
import { ConfirmStep, CreatingStep } from "~/t3work/t3work-CreateProjectDialogConfirmStep";

export function SourceStep({
  loading,
  siteUrl,
  email,
  apiToken,
  setSiteUrl,
  setEmail,
  setApiToken,
  onConnectBasic,
  onConnectOAuth,
  isValidUrl,
}: {
  loading: boolean;
  siteUrl: string;
  email: string;
  apiToken: string;
  setSiteUrl: (value: string) => void;
  setEmail: (value: string) => void;
  setApiToken: (value: string) => void;
  onConnectBasic: () => void;
  onConnectOAuth: () => void;
  isValidUrl: (value: string) => boolean;
}) {
  if (loading) {
    return (
      <section className="space-y-3">
        <div>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Connect Atlassian Jira</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Authenticate to your Jira workspace to import projects and issues.
        </p>
      </div>
      <Input
        value={siteUrl}
        onChange={(event) => setSiteUrl(event.target.value)}
        placeholder="https://your-company.atlassian.net"
      />
      <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
      <Input
        type="password"
        value={apiToken}
        onChange={(event) => setApiToken(event.target.value)}
        placeholder="API token"
      />
      <div className="flex items-center gap-2">
        <Button onClick={onConnectBasic} disabled={!isValidUrl(siteUrl)}>
          Connect with API token
        </Button>
        <Button variant="outline" onClick={onConnectOAuth}>
          Connect with OAuth
        </Button>
      </div>
    </section>
  );
}

export function AccountStep({
  accounts,
  selectedAccount,
  onSelectAccount,
  loading,
}: {
  accounts: ReadonlyArray<IntegrationAccount>;
  selectedAccount: IntegrationAccount | null;
  onSelectAccount: (account: IntegrationAccount) => void;
  loading: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Select Jira Site</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose which Atlassian site to import projects from.
        </p>
      </div>
      <div className="space-y-2">
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-md" />
            ))
          : accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => onSelectAccount(account)}
                className={`flex w-full items-center justify-between rounded-md border p-3 text-left ${selectedAccount?.id === account.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <span className="text-sm font-medium">{account.label}</span>
                <span className="text-xs text-muted-foreground">{account.provider}</span>
              </button>
            ))}
      </div>
    </section>
  );
}

export function ProjectStep({
  filteredProjects,
  selectedProject,
  projectQuery,
  setProjectQuery,
  onSelectProject,
  loading,
}: {
  filteredProjects: ReadonlyArray<ExternalProject>;
  selectedProject: ExternalProject | null;
  projectQuery: string;
  setProjectQuery: (value: string) => void;
  onSelectProject: (project: ExternalProject) => void;
  loading: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Select Project</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Search and select a project to add to your workspace.
        </p>
      </div>
      <Input
        value={projectQuery}
        onChange={(event) => setProjectQuery(event.target.value)}
        placeholder="Search by name or key..."
        disabled={loading}
      />
      <div className="space-y-2">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-md" />
            ))
          : filteredProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project)}
                className={`flex w-full items-center justify-between rounded-md border p-3 text-left ${selectedProject?.id === project.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <div>
                  <div className="text-sm font-medium">{project.title}</div>
                  <div className="text-xs text-muted-foreground">{project.key}</div>
                </div>
                <Building2 className="size-4 text-muted-foreground" />
              </button>
            ))}
      </div>
    </section>
  );
}
