import { ArrowRight, BadgeCheck, Sparkles } from "lucide-react";

import { Button } from "~/t3work/components/ui/t3work-button";
import {
  listT3workProjectSetupCardOptions,
  T3workProjectSetupProfileCards,
} from "~/t3work/t3work-ProjectSetupProfileCards";
import {
  useT3workProjectSetupProfile,
  writeT3workProjectSetupProfile,
} from "~/t3work/t3work-projectSetupProfile";

const SETUP_STEPS = [
  {
    step: "01",
    title: "Pick your style",
    description: "Choose how technical, concise, and guided t3work should feel.",
  },
  {
    step: "02",
    title: "Connect Jira",
    description: "Select the Atlassian site and project you want to work from.",
  },
  {
    step: "03",
    title: "Start working",
    description: "GitHub links are optional. You can add them now or later.",
  },
] as const;

export function T3workSetupWelcomeSurface({ onCreate }: { onCreate: () => void }) {
  const setupProfileId = useT3workProjectSetupProfile();
  const selectedProfile = listT3workProjectSetupCardOptions().find(
    (option) => option.id === setupProfileId,
  );

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(44rem_22rem_at_top,color-mix(in_srgb,var(--color-sky-400)_22%,transparent),transparent)] opacity-80" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,color-mix(in_srgb,var(--background)_88%,white)_0%,var(--background)_42%,color-mix(in_srgb,var(--background)_94%,var(--color-amber-100))_100%)] dark:bg-[linear-gradient(140deg,color-mix(in_srgb,var(--background)_92%,black)_0%,var(--background)_42%,color-mix(in_srgb,var(--background)_94%,var(--color-sky-950))_100%)]" />

      <section className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/85 p-4 shadow-2xl shadow-black/10 backdrop-blur sm:p-6 xl:p-8">
        <div className="pointer-events-none absolute -left-10 top-14 size-40 rounded-full bg-sky-400/20 blur-3xl motion-safe:animate-pulse" />
        <div
          className="pointer-events-none absolute right-0 top-0 size-52 rounded-full bg-amber-300/20 blur-3xl motion-safe:animate-pulse"
          style={{ animationDelay: "900ms" }}
        />

        <div
          className="relative grid items-start gap-8"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))" }}
        >
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur-sm">
              <Sparkles className="size-3.5 text-sky-500" />
              First project setup
            </div>

            <div className="max-w-2xl space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Bring your Jira work into t3work in a few clicks.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                Pick how you want t3work to communicate, connect a Jira project, and start from a
                workspace that feels ready out of the box.
              </p>
            </div>

            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))" }}
            >
              {SETUP_STEPS.map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-border/65 bg-background/75 p-4 shadow-sm backdrop-blur-sm"
                >
                  <div className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                    {item.step}
                  </div>
                  <h2 className="mt-2 text-sm font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button className="w-full gap-2 sm:w-auto" onClick={onCreate}>
                Set up first project
                <ArrowRight className="size-4" />
              </Button>
              <div className="inline-flex min-w-0 items-center gap-2 rounded-full bg-background/75 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
                <BadgeCheck className="size-3.5 text-emerald-500" />
                Selected profile: {selectedProfile?.title ?? "Project Partner"}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Who are you, and how do you want to work?
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Choose a style that matches your day-to-day work. You can change it later in
                Settings or before creating a project.
              </p>
            </div>

            <T3workProjectSetupProfileCards
              selectedProfileId={setupProfileId}
              onSelectProfile={writeT3workProjectSetupProfile}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
