import {
  EnvironmentId,
  MessageId,
  ProviderDriverKind,
  type ServerProviderSkill,
  withT3TeamMessageExtContext,
} from "@t3tools/contracts";

import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import {
  searchSlashCommandItems,
  slashCommandItemsForPromptPosition,
} from "~/components/chat/composerSlashCommandSearch";
import type { TimelineRowSharedState } from "~/components/chat/timelineRowContext";
import type { ComposerTrigger } from "~/composer-logic";
import { t3teamMessageExtOf } from "~/t3team/chat/t3team-messageFraming";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import type { ChatMessage } from "~/types";

function recipe(
  id: string,
  title: string,
  description: string,
  slashAlias?: string,
): T3TeamSidecarRecipeQuickStart {
  return {
    id,
    title,
    description,
    prompt: description,
    ...(slashAlias ? { slashAlias } : {}),
    workflow: {
      kind: "recipe",
      recipeId: id,
      title,
      description,
      source: "project-local",
      surface: "thread.context",
      reason: "Passt zum aktuellen Thread",
      recipePath: `/workspace/kreditoren/.t3team/recipes/${id}`,
      workflowPath: `/workspace/kreditoren/.t3team/recipes/${id}/${id}.workflow.ts`,
    },
  };
}

/** A project catalog as discovery returns it: German titles, some far longer than a menu row. */
export const STORY_RECIPES: ReadonlyArray<T3TeamSidecarRecipeQuickStart> = [
  recipe(
    "rechnungsfreigabe-pruefen",
    "Rechnungsfreigabe für Lieferantenverträge mit abweichender Zahlungsfrist prüfen",
    "Gleicht Zahlungsfristen der offenen Kreditorenbelege mit den Vertragskonditionen ab und markiert jede Abweichung über fünf Tage.",
    "rechnung-pruefen",
  ),
  recipe(
    "skonto-abgleich",
    "Skontoabzüge der letzten Zahlungsläufe gegen Vertragsbedingungen abgleichen",
    "Findet Skontoabzüge, die nach Ablauf der Skontofrist gezogen wurden.",
  ),
  recipe(
    "mahnlauf-vorbereiten",
    "Mahnlauf für überfällige Debitorenposten vorbereiten",
    "Stellt die Mahnstufe pro Kunde zusammen und entwirft die Mahntexte.",
  ),
  recipe(
    "qa-testplan",
    "QA-Testplan für die Überlaufbehandlung im Kreditorenbeleg erstellen",
    "Leitet Testfälle aus den Akzeptanzkriterien ab, inklusive Randfälle bei Fremdwährungen.",
    "qa-plan",
  ),
  recipe(
    "risiko-einschaetzung",
    "Risikoeinschätzung für die Umstellung auf die neue Kontenrahmenversion",
    "Bewertet betroffene Buchungsregeln und schlägt eine Reihenfolge für die Migration vor.",
    "risiko",
  ),
  recipe(
    "release-notes",
    "Release Notes aus den gemergten Änderungen der Woche schreiben",
    "Fasst die Änderungen für Fachanwender zusammen, ohne technische Details.",
  ),
  recipe(
    "ticket-zerlegen",
    "Ticket in umsetzbare Unteraufgaben mit Schätzung zerlegen",
    "Schlägt Unteraufgaben mit Stundenschätzung vor und verlinkt betroffene Module.",
  ),
  recipe(
    "pr-review",
    "Pull Request auf Buchungslogik und Rundungsfehler prüfen",
    "Prüft Beträge, Rundung und Währungsumrechnung in den geänderten Dateien.",
  ),
  recipe(
    "abschluss-checkliste",
    "Monatsabschluss-Checkliste für die Kreditorenbuchhaltung abarbeiten",
    "Geht die Abschlusspunkte durch und meldet offene Abstimmungen.",
    "abschluss",
  ),
  recipe(
    "lieferant-anlegen",
    "Neuen Lieferanten mit Bankverbindung und Zahlungsbedingungen anlegen",
    "Prüft IBAN, UID-Nummer und Dublettenverdacht vor dem Anlegen.",
  ),
  recipe(
    "zahlungsvorschlag",
    "Zahlungsvorschlag für den nächsten Zahlungslauf erstellen",
    "Berücksichtigt Fälligkeit, Skonto und gesperrte Lieferanten.",
  ),
  recipe(
    "dokumentation-aktualisieren",
    "Fachdokumentation nach Änderungen an der Freigabelogik aktualisieren",
    "Ergänzt die Prozessbeschreibung und markiert veraltete Abschnitte.",
    "doku",
  ),
  recipe(
    "fehleranalyse",
    "Fehleranalyse für abgelehnte Belege im Eingangsrechnungsworkflow",
    "Sammelt Ablehnungsgründe und gruppiert sie nach Ursache.",
  ),
  recipe(
    "kreditlimit-pruefen",
    "Kreditlimit-Überschreitungen bei Grosskunden prüfen",
    "Listet Kunden über Limit und schlägt Massnahmen vor.",
  ),
];

const SKILLS: ReadonlyArray<ServerProviderSkill> = [
  {
    name: "buchungsregeln",
    path: "/workspace/kreditoren/.claude/skills/buchungsregeln/SKILL.md",
    scope: "project",
    enabled: true,
    shortDescription: "Buchungsregeln und Kontierung der Kreditorenbuchhaltung",
  },
  {
    name: "frontend-testing",
    path: "/home/pj/.claude/skills/frontend-testing/SKILL.md",
    scope: "personal",
    enabled: true,
    shortDescription: "Playwright-Harness für Oberflächentests",
  },
];

export const STORY_PROVIDER_SLASH_COMMANDS = [
  { name: "compact", description: "Clear conversation history but keep a summary in context" },
  { name: "review", description: "Review a pull request" },
];

const CLAUDE = ProviderDriverKind.make("claudeAgent");

type HostSlashItem = Extract<
  ComposerCommandItem,
  { type: "slash-command" | "provider-slash-command" | "skill" }
>;

/** The `/` items `useComposerMenuItems` builds for a Claude thread with side chat available. */
const HOST_SLASH_ITEMS: ReadonlyArray<HostSlashItem> = [
  {
    id: "slash:model",
    type: "slash-command",
    command: "model",
    label: "/model",
    description: "Switch response model for this thread",
  },
  {
    id: "slash:plan",
    type: "slash-command",
    command: "plan",
    label: "/plan",
    description: "Switch this thread into plan mode",
  },
  {
    id: "slash:default",
    type: "slash-command",
    command: "default",
    label: "/default",
    description: "Switch this thread back to normal build mode",
  },
  {
    id: "slash:side",
    type: "slash-command",
    command: "side",
    label: "/side",
    description: "Ask a side question in a new side chat",
  },
  {
    id: "slash:btw",
    type: "slash-command",
    command: "btw",
    label: "/btw",
    description: "Same as /side",
  },
  ...STORY_PROVIDER_SLASH_COMMANDS.map((command) => ({
    id: `provider-slash-command:claudeAgent:${command.name}`,
    type: "provider-slash-command" as const,
    provider: CLAUDE,
    command,
    label: `/${command.name}`,
    description: command.description,
  })),
  ...SKILLS.map((skill) => ({
    id: `skill:claudeAgent:${skill.name}`,
    type: "skill" as const,
    provider: CLAUDE,
    skill,
    label: `/skill:${skill.name}`,
    description: skill.shortDescription ?? "",
  })),
];

export function hostSlashItemsFor(trigger: ComposerTrigger | null): ComposerCommandItem[] {
  if (trigger?.kind !== "slash-command") return [];
  return searchSlashCommandItems(
    slashCommandItemsForPromptPosition(HOST_SLASH_ITEMS, trigger.rangeStart === 0),
    trigger.query,
  );
}

const noop = () => undefined;

export const STORY_TIMELINE_STATE: TimelineRowSharedState = {
  pendingApprovals: new Map(),
  respondingRequestIds: [],
  canOperateThread: true,
  onRespondToApproval: undefined,
  citationRequest: null,
  listRef: { current: null },
  timestampFormat: "locale",
  routeThreadKey: "storybook:recipe-thread",
  threadRef: null,
  markdownCwd: undefined,
  resolvedTheme: "light",
  workspaceRoot: undefined,
  skills: SKILLS,
  runs: [],
  activeThreadEnvironmentId: EnvironmentId.make("storybook"),
  onRevertToTurnCount: noop,
  onUseArtifactTemplate: noop,
  onSendAppMessage: undefined,
  onAppFullscreenChange: noop,
  onRunShellCommand: undefined,
  findActive: false,
  onImageExpand: noop,
  onOpenToolDiff: undefined,
  onOpenTurnDiff: undefined,
  renderHtmlRender: undefined,
  turnItemSource: undefined,
  onOpenThread: noop,
  workflowOpening: null,
  onForkFromRun: undefined,
  onToggleTurnFold: noop,
  onToggleAttemptFold: noop,
  onFileOpen: noop,
  onFileDownload: noop,
  openPullRequest: noop,
  onToggleWorkGroup: noop,
  onToggleWorkEntry: noop,
  onCancelWorktreeSetup: null,
  retryableWorkspacePreparationRunIds: new Set(),
  onRetryWorkspacePreparation: null,
  onWorktreeSetupWorkLocally: null,
  onOpenWorktreeSetupTerminal: null,
  workGroupViewState: { scrollPositions: new Map(), expandedEntries: new Set() },
  threadJobsController: undefined,
  backgroundJobStarters: new Map(),
};

/** A user message as the timeline receives it: the ext rides the message context record. */
export function storyUserMessage(input: {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly recipe?: T3TeamSidecarRecipeQuickStart | undefined;
}): ChatMessage {
  const context = input.recipe
    ? withT3TeamMessageExtContext({
        recipeKickoff: {
          recipeId: input.recipe.id,
          title: input.recipe.title,
          ...(input.recipe.workflow?.workflowPath
            ? { workflowPath: input.recipe.workflow.workflowPath }
            : {}),
        },
      })
    : undefined;
  return {
    id: MessageId.make(input.id),
    role: "user",
    text: input.text,
    runId: null,
    streaming: false,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    ...(context ? { context, ...t3teamMessageExtOf({ context }) } : {}),
  };
}
