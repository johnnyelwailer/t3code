import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TicketKickoffComposerSelectedRecipe } from "~/t3work/t3work-TicketKickoffComposerSelectedRecipe";

describe("TicketKickoffComposerSelectedRecipe", () => {
  it("renders the recipe description and selected options without extra helper copy", () => {
    const markup = renderToStaticMarkup(
      <TicketKickoffComposerSelectedRecipe
        selectedRecipe={{
          recipe: {
            id: "unblock-blocked-ticket",
            title: "Unblock IES-9242",
            description: "Pick the next move that will reopen progress.",
            composerGuidance: {
              helperText: "Add any context that could change the recommendation.",
            },
            prompt: "Unblock this work.",
            workflow: {
              kind: "recipe",
              recipeId: "unblock-blocked-ticket",
              title: "Unblock IES-9242",
              description: "Pick the next move that will reopen progress.",
              source: "bundled",
              surface: "workitem.detail.sidepanel",
            },
          },
          customization: {
            selections: [
              {
                name: "focusArea",
                label: "Extra focus",
                value: "handoff risk",
                displayValue: "handoff risk",
              },
            ],
          },
        }}
        onClearSelectedRecipe={() => {}}
      />,
    );

    expect(markup).toContain("Selected action");
    expect(markup).toContain("Unblock IES-9242");
    expect(markup).toContain("Pick the next move that will reopen progress.");
    expect(markup).toContain("Extra focus: handoff risk");
    expect(markup).not.toContain("Add any context that could change the recommendation.");
    expect(markup).toContain('aria-label="Clear selected action"');
    expect(markup).not.toContain(">Clear<");
  });
});
