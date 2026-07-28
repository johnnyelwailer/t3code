import { Loader2 } from "lucide-react";
import type { ExternalProject } from "@t3tools/integrations-core";
import { ProjectAvatar } from "~/t3team/components/t3team-ProjectAvatar";
import { listT3TeamProjectSetupCardOptions } from "~/t3team/t3team-ProjectSetupProfileCards";
import { useT3TeamPackSetupProfiles } from "~/t3team/t3team-packSetupProfiles";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

/**
 * Names the project being added, in the wizard frame's own heading slot (see
 * `CreateProjectWizardFrame`'s `heading` prop) — used for the "review" step. Reuses `ProjectAvatar`
 * — the same icon/key presentation the project-picker step already uses — instead of inventing a
 * second one.
 */
export function ConfirmStepHeading({
  selectedProject,
}: {
  selectedProject: ExternalProject | null;
}) {
  if (!selectedProject) return null;

  return (
    <div className="flex min-w-0 items-center gap-2.5 px-1">
      <ProjectAvatar
        title={selectedProject.title}
        projectKey={selectedProject.key}
        raw={selectedProject.raw}
        iconUrl={selectedProject.iconUrl}
        className="size-8 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Add project
        </div>
        <h2 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {selectedProject.title}
          {selectedProject.key ? (
            <span className="ml-2 text-sm font-medium text-muted-foreground">
              {selectedProject.key}
            </span>
          ) : null}
        </h2>
      </div>
    </div>
  );
}

export function CreatingStep({
  projectTitle,
  repositoryCount,
  setupProfileId,
}: {
  projectTitle: string | undefined;
  repositoryCount: number;
  setupProfileId: T3TeamProjectSetupProfileId;
}) {
  const packProfiles = useT3TeamPackSetupProfiles();
  const title = projectTitle ?? "project";
  const setupProfileTitle =
    listT3TeamProjectSetupCardOptions(packProfiles).find((option) => option.id === setupProfileId)
      ?.title ?? "Project Partner";

  return (
    <section className="flex min-h-[18rem] items-center justify-center px-2 py-6 sm:min-h-[22rem]">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card px-6 py-7 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
            <Loader2 className="size-6 animate-spin" />
          </div>
          <h3 className="text-base font-semibold">Creating {title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            We&apos;re provisioning the workspace and tailoring it for the {setupProfileTitle}
            profile.
          </p>
        </div>

        <div className="mt-6 space-y-3 text-left">
          {[
            "Preparing the managed workspace",
            `Applying the ${setupProfileTitle} setup`,
            repositoryCount > 0
              ? `Linking ${repositoryCount} repository${repositoryCount === 1 ? "" : "ies"}`
              : "No repositories selected yet",
            "Finalizing the project shell",
          ].map((label) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="size-2.5 rounded-full bg-current" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">In progress</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          This usually takes a few seconds. Keep this window open while the project is created.
        </div>
      </div>
    </section>
  );
}
