/**
 * The numbered "what happens next" cards on the first-run setup surface. Split out of
 * `t3team-SetupWelcomeSurface.tsx` so the surface stays under the guard's line cap once it has to
 * render two shapes: with and without the work profile chooser.
 *
 * Step numbers are derived, not written down, so dropping the profile step renumbers the rest
 * instead of leaving a gap at 01.
 */

const PROFILE_STEP = {
  title: "Pick your style",
  description: "Choose how technical, concise, and guided the assistant should feel.",
} as const;

const CORE_STEPS = [
  {
    title: "Connect Jira",
    description: "Select the Atlassian site and project you want to work from.",
  },
  {
    title: "Start working",
    description: "GitHub links are optional. You can add them now or later.",
  },
] as const;

export type T3TeamSetupWelcomeStep = {
  readonly step: string;
  readonly title: string;
  readonly description: string;
};

export function listT3TeamSetupWelcomeSteps(
  includeProfileStep: boolean,
): ReadonlyArray<T3TeamSetupWelcomeStep> {
  const steps = includeProfileStep ? [PROFILE_STEP, ...CORE_STEPS] : CORE_STEPS;
  return steps.map((item, index) => ({ ...item, step: String(index + 1).padStart(2, "0") }));
}

export function T3TeamSetupWelcomeSteps({ includeProfileStep }: { includeProfileStep: boolean }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))" }}
    >
      {listT3TeamSetupWelcomeSteps(includeProfileStep).map((item) => (
        <div
          key={item.step}
          className="rounded-2xl border border-border/65 bg-background/75 p-4 shadow-sm backdrop-blur-sm"
        >
          <div className="text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
            {item.step}
          </div>
          <h2 className="mt-2 text-sm font-semibold text-foreground">{item.title}</h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.description}</p>
        </div>
      ))}
    </div>
  );
}
