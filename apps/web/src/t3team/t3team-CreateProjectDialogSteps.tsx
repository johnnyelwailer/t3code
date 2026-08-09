import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";
import { Input } from "~/t3team/components/ui/t3team-input";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { ProjectAvatar } from "~/t3team/components/t3team-ProjectAvatar";
import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import type { ExistingProjectMatch } from "~/t3team/hooks/t3team-useExistingProjectForExternalProject";

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
          ? ["account-1", "account-2", "account-3"].map((key) => (
              <Skeleton key={key} className="h-14 w-full rounded-md" />
            ))
          : accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => onSelectAccount(account)}
                aria-pressed={selectedAccount?.id === account.id}
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
  alreadyAdded,
  onOpenExistingProject,
}: {
  filteredProjects: ReadonlyArray<ExternalProject>;
  selectedProject: ExternalProject | null;
  projectQuery: string;
  setProjectQuery: (value: string) => void;
  onSelectProject: (project: ExternalProject) => void;
  loading: boolean;
  /** Externally-bound projects already added to the workspace, keyed by external project id. */
  alreadyAdded?: ReadonlyMap<string, ExistingProjectMatch>;
  onOpenExistingProject?: (projectId: string) => void;
}) {
  const showLoadingSkeletons = loading && filteredProjects.length === 0;

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
        disabled={showLoadingSkeletons}
      />
      <div className="space-y-2">
        {showLoadingSkeletons
          ? ["project-1", "project-2", "project-3", "project-4"].map((key) => (
              <Skeleton key={key} className="h-14 w-full rounded-md" />
            ))
          : filteredProjects.map((project) => {
              const existing = alreadyAdded?.get(project.id);
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() =>
                    existing ? onOpenExistingProject?.(existing.projectId) : onSelectProject(project)
                  }
                  aria-pressed={selectedProject?.id === project.id}
                  className={`flex w-full items-center justify-between rounded-md border p-3 text-left ${selectedProject?.id === project.id ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ProjectAvatar
                      title={project.title}
                      projectKey={project.key}
                      raw={project.raw}
                      iconUrl={project.iconUrl}
                      className="size-5 shrink-0 rounded-sm object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{project.title}</div>
                      <div className="text-xs text-muted-foreground">{project.key}</div>
                    </div>
                  </div>
                  {existing ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" size="sm">
                        Already added
                      </Badge>
                      <span className="text-xs font-medium text-foreground">Open project</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
      </div>
    </section>
  );
}
