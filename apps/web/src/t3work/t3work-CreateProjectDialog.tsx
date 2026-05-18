import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { splitRepositoryInput } from "~/t3work/components/t3work-linkedRepositories";
import { Button } from "~/t3work/components/ui/t3work-button";
import { Card } from "~/t3work/components/ui/t3work-card";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import { useAtlassianOAuth } from "~/t3work/hooks/t3work-useAtlassianOAuth";
import { useCreateProject } from "~/t3work/hooks/t3work-useCreateProject";
import { AccountStep, ProjectStep, SourceStep } from "~/t3work/t3work-CreateProjectDialogSteps";
import { ConfirmStep, CreatingStep } from "~/t3work/t3work-CreateProjectDialogConfirmStep";

export function CreateProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: ProjectShellProject) => void;
}) {
  const setup = useCreateProject();
  const oauth = useAtlassianOAuth();
  const {
    loadPersistedAccounts,
    loadAccountsWithOAuth,
    projects,
    selectedAccount,
    selectedProject,
    bootstrapping,
    loadingAccounts,
    loadingProjects,
  } = setup;
  const [siteUrl, setSiteUrl] = useState("https://");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [linkedRepositoryUrls, setLinkedRepositoryUrls] = useState<ReadonlyArray<string>>([]);
  const [newRepositoryUrl, setNewRepositoryUrl] = useState("");

  useEffect(() => {
    void loadPersistedAccounts();
  }, [loadPersistedAccounts]);
  useEffect(() => {
    if (oauth.state.kind !== "done") return;
    void loadAccountsWithOAuth(oauth.state.sites, oauth.state.token);
  }, [oauth.state, loadAccountsWithOAuth]);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) =>
      `${project.title} ${project.key ?? ""}`.toLowerCase().includes(query),
    );
  }, [projectQuery, projects]);

  const createSelectedProject = async () => {
    if (!selectedProject) return;
    const project = await setup.createProject(selectedProject, { linkedRepositoryUrls });
    onCreated(project);
  };

  const addRepository = () => {
    const normalized = splitRepositoryInput(newRepositoryUrl);
    if (normalized.length === 0) return;
    setLinkedRepositoryUrls((current) => [...new Set([...current, ...normalized])]);
    setNewRepositoryUrl("");
  };

  const removeRepository = (url: string) => {
    setLinkedRepositoryUrls((current) => current.filter((entry) => entry !== url));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-2 sm:items-center sm:p-4">
      <Card className="flex h-full w-full max-w-3xl flex-col overflow-hidden sm:h-[min(40rem,calc(100dvh-2rem))]">
        <div className="flex justify-end px-3 pt-3">
          <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close dialog">
            <X className="size-4" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-5 pb-5 pt-1">
            {setup.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {setup.error}
              </div>
            ) : null}
            {setup.step === "source" ? (
              <SourceStep
                loading={bootstrapping}
                siteUrl={siteUrl}
                email={email}
                apiToken={apiToken}
                setSiteUrl={setSiteUrl}
                setEmail={setEmail}
                setApiToken={setApiToken}
                onConnectBasic={() =>
                  void setup.loadAccountsWithBasic({ siteUrl, email, apiToken })
                }
                onConnectOAuth={() => void oauth.startOAuth()}
                isValidUrl={setup.isValidUrl}
              />
            ) : null}
            {setup.step === "account" ? (
              <AccountStep
                accounts={setup.accounts}
                selectedAccount={setup.selectedAccount}
                onSelectAccount={setup.setSelectedAccount}
                loading={loadingAccounts}
              />
            ) : null}
            {setup.step === "project" ? (
              <ProjectStep
                filteredProjects={filteredProjects}
                selectedProject={setup.selectedProject}
                projectQuery={projectQuery}
                setProjectQuery={setProjectQuery}
                onSelectProject={setup.setSelectedProject}
                loading={loadingProjects}
              />
            ) : null}
            {setup.step === "confirm" ? (
              <ConfirmStep
                selectedProject={selectedProject}
                linkedRepositoryUrls={linkedRepositoryUrls}
                newRepositoryUrl={newRepositoryUrl}
                setNewRepositoryUrl={setNewRepositoryUrl}
                onAddRepository={addRepository}
                onRemoveRepository={removeRepository}
                onAddRepositories={(urls: ReadonlyArray<string>) =>
                  setLinkedRepositoryUrls((current) => [...new Set([...current, ...urls])])
                }
              />
            ) : null}
            {setup.step === "creating" ? <CreatingStep /> : null}
          </div>
        </ScrollArea>

        {setup.step !== "source" && setup.step !== "creating" ? (
          <footer className="border-t border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (setup.step === "account") {
                    setup.setStep("source");
                    return;
                  }
                  if (setup.step === "project") {
                    setup.setStep("account");
                    return;
                  }
                  setup.setStep("project");
                }}
              >
                Back
              </Button>
              {setup.step === "account" ? (
                <Button
                  onClick={() =>
                    selectedAccount ? void setup.loadProjects(selectedAccount) : undefined
                  }
                  disabled={!selectedAccount || loadingProjects}
                >
                  {loadingProjects ? "Loading projects..." : "Continue"}
                </Button>
              ) : null}
              {setup.step === "project" ? (
                <Button onClick={() => setup.setStep("confirm")} disabled={!selectedProject}>
                  Continue
                </Button>
              ) : null}
              {setup.step === "confirm" ? (
                <Button onClick={() => void createSelectedProject()} disabled={!selectedProject}>
                  Add project
                </Button>
              ) : null}
            </div>
          </footer>
        ) : null}
      </Card>
    </div>
  );
}
