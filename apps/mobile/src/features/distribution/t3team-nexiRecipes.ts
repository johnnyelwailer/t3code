import { isNexiProviderDriver } from "../../lib/t3team-nexiProvider";

/**
 * The Nexi Work recipe library, mirrored from `contents.recipes` of the `nexplore-global` pack
 * (id, title, short description and slash alias of each `recipe.ts`), in the pack's rank order.
 *
 * Recipes are discovered and run on the server. The web client discovers them over an HTTP route
 * the phone cannot reach through the relay, so the app ships the catalogue and launches a recipe
 * through the Nexi agent, which runs it by id with `t3_orchestration_run { recipe }` — the same
 * bindings a launch from the web UI gets.
 */
export interface NexiRecipe {
  readonly id: string;
  readonly slashAlias: string;
  readonly title: string;
  readonly shortDescription: string;
}

export const NEXI_RECIPES: ReadonlyArray<NexiRecipe> = [
  {
    id: "whats-needing-me",
    slashAlias: "needs-me",
    title: "Was braucht mich?",
    shortDescription:
      "Rangliste der wartenden, blockierten und stehengebliebenen Items — mit Entwurf für das dringendste.",
  },
  {
    id: "story-readiness-check",
    slashAlias: "story-ready",
    title: "Story-Reifegrad prüfen",
    shortDescription:
      "Definition of Ready: echte statt Template-AC, erreichbare Spezifikation, geschärfter AC-Entwurf.",
  },
  {
    id: "release-readiness-check",
    slashAlias: "release-check",
    title: "Release-Freigabe prüfen",
    shortDescription:
      "Prüft vor dem Release, was belegbar fertig ist, was ohne Nachweis gemeldet wurde und was eine Entscheidung braucht.",
  },
  {
    id: "status-report-prefill",
    slashAlias: "status-report",
    title: "Statusbericht vorbereiten",
    shortDescription:
      "Zahlen für Sprint- und Statusbericht automatisch zusammenstellen; die Einschätzung wird abgefragt.",
  },
  {
    id: "estimation-reality-check",
    slashAlias: "estimation-check",
    title: "Schätzung gegen Realität prüfen",
    shortDescription:
      "Vergleicht dieses Item mit ähnlicher abgeschlossener Arbeit: Schätzung vs. Ist, Überzugs-Risiko, Puffer-Spanne.",
  },
  {
    id: "retro-prefill",
    slashAlias: "retro",
    title: "Retro vorbereiten",
    shortDescription:
      "Stellt die Fakten der Iteration zusammen — erledigt, verschoben, Aufwandsabweichungen, offene Massnahmen der letzten Retro.",
  },
  {
    id: "review-pipeline",
    slashAlias: "change-review",
    title: "Änderungen prüfen",
    shortDescription:
      "Prüft eine Änderung durch mehrere unabhängige Lenses, widerlegt jeden Befund vor dem Bericht und lässt dich entscheiden, was blockiert.",
  },
  {
    id: "bug-intake-assistant",
    slashAlias: "bug-intake",
    title: "Befund zu Bug-Report ausbauen",
    shortDescription:
      "Aus einem rohen Befund einen vollständigen, duplikatgeprüften Bug-Report-Entwurf machen.",
  },
  {
    id: "meeting-notes-to-items",
    slashAlias: "sitzungsnotizen",
    title: "Sitzungsnotizen auswerten",
    shortDescription:
      "Findet Entscheide, Massnahmen und offene Fragen in Sitzungsnotizen — mit Verantwortlichen, ohne Doppelspurigkeit.",
  },
  {
    id: "discussion-recap",
    slashAlias: "recap",
    title: "Diskussion zusammenfassen",
    shortDescription:
      "Wo steht dieser Thread: entschieden, offen, und wer schuldet seit wann eine Antwort.",
  },
];

/**
 * Recipes the slash menu offers for a lowercased query. Only the Nexi agent can run them, so other
 * providers get none, and like provider commands they only apply at the start of a message.
 */
export function matchNexiRecipes(input: {
  readonly query: string;
  readonly atMessageStart: boolean;
  readonly providerDriver: string | null | undefined;
}): ReadonlyArray<NexiRecipe> {
  if (!input.atMessageStart || !isNexiProviderDriver(input.providerDriver)) return [];
  return NEXI_RECIPES.filter(
    (recipe) =>
      recipe.slashAlias.includes(input.query) || recipe.title.toLowerCase().includes(input.query),
  );
}

/** The message that asks the Nexi agent to run a recipe; the id is what its tool takes. */
export function nexiRecipeLaunchText(recipe: NexiRecipe): string {
  return `Run recipe ${recipe.id} („${recipe.title}“). `;
}
