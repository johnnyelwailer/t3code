import { useMemo, useState } from "react";
import { ArrowRight, Check, Search, Sparkles } from "lucide-react";

import { APP_STAGE_LABEL } from "~/branding";
import {
  listT3workProjectSetupCardOptions,
  T3WORK_PROFILE_CATEGORIES,
  T3workProjectSetupProfileCards,
  type T3workProfileCategoryId,
} from "~/t3work/t3work-ProjectSetupProfileCards";
import {
  useT3workProjectSetupProfile,
  writeT3workProjectSetupProfile,
} from "~/t3work/t3work-projectSetupProfile";

const SETUP_STEPS = [
  { step: 1, title: "Pick your style", state: "active" as const },
  { step: 2, title: "Connect Jira", state: "next" as const },
  { step: 3, title: "Start working", state: "todo" as const },
];

export function T3workSetupWelcomeSurface({ onCreate }: { onCreate: () => void }) {
  const setupProfileId = useT3workProjectSetupProfile();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<T3workProfileCategoryId | "all">("all");

  const allOptions = listT3workProjectSetupCardOptions();
  const selectedProfile = allOptions.find((option) => option.id === setupProfileId);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allOptions.filter((option) => {
      if (category !== "all" && option.category !== category) return false;
      if (!normalizedQuery) return true;
      const haystack =
        `${option.title} ${option.badge} ${option.description} ${option.bullets.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [allOptions, category, query]);

  return (
    <div
      className="t3work-onboarding flex h-full min-h-0 w-full flex-col"
      style={{ background: "var(--nx-bg)" }}
    >
      <header
        className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6"
        style={{ borderBottom: "1px solid var(--nx-border)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="nx-logo">
            <Sparkles className="size-4" />
          </span>
          <span className="truncate text-sm font-semibold" style={{ color: "var(--nx-heading)" }}>
            t3work
          </span>
          <span className="nx-brand-badge">Nexi AI</span>
        </div>
        {APP_STAGE_LABEL ? <span className="nx-version">{APP_STAGE_LABEL}</span> : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="nx-rail flex w-full shrink-0 flex-col gap-7 p-8 lg:h-full lg:w-[340px] lg:overflow-y-auto">
          <div className="flex flex-col gap-5">
            <span className="nx-pill self-start">
              <Sparkles className="size-3.5" />
              Setup wizard
            </span>
            <h1 className="nx-h1 max-w-[16rem]">Bring your Jira work into t3work.</h1>
            <p className="nx-sub max-w-[18rem]">
              Connect Jira, choose how Nexi AI should support your team and start with guided
              project setup.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {SETUP_STEPS.map((item) => (
              <div key={item.step} className="nx-step" data-state={item.state}>
                <span className="nx-step-badge" data-state={item.state}>
                  {item.state === "active" ? <Check className="size-3.5" /> : item.step}
                </span>
                <span className="nx-step-label">{item.title}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-4">
            <button type="button" className="nx-cta" onClick={onCreate}>
              Set up first project
              <ArrowRight className="size-4" />
            </button>
            <button type="button" className="nx-skip self-center" onClick={onCreate}>
              Skip for now
            </button>
          </div>
        </aside>

        <main className="min-h-0 flex-1 px-4 py-7 sm:px-6 sm:py-8 lg:h-full lg:overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="nx-eyebrow">Step 1 of 3</span>
              <h2 className="nx-h2">Pick your working style</h2>
              <p className="nx-sub max-w-[40rem]">
                Choose the role that best matches how Nexi AI should support your work. You can
                change this later.
              </p>
            </div>

            <label className="nx-search">
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a role…"
                aria-label="Find a role"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {T3WORK_PROFILE_CATEGORIES.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="nx-tab"
                  data-active={category === tab.id ? "true" : "false"}
                  aria-pressed={category === tab.id}
                  onClick={() => setCategory(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {filteredOptions.length > 0 ? (
              <T3workProjectSetupProfileCards
                selectedProfileId={setupProfileId}
                onSelectProfile={writeT3workProjectSetupProfile}
                options={filteredOptions}
              />
            ) : (
              <p className="nx-sub py-8 text-center">No roles match your search.</p>
            )}

            <p className="nx-eyebrow pt-1">
              Selected role: <span style={{ color: "var(--nx-accent)" }}>{selectedProfile?.title ?? "—"}</span>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
