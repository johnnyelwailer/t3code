/* oxlint-disable react/no-array-index-key -- Existing merged lint debt; keep green while preserving behavior. */
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bug,
  ClipboardCheck,
  ClipboardList,
  Code2,
  LifeBuoy,
  Link2,
  ListFilter,
  ListTodo,
  MessageSquare,
  Newspaper,
  Search,
  Ship,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "~/t3work/components/ui/t3work-badge";
import { RecipeActionIssuePreview } from "~/t3work/t3work-recipeActionIssuePreview";
import { LaunchOptionGroup, LaunchTextInput } from "~/t3work/t3work-recipeActionLaunchControls";
import { InlineActionChip } from "~/t3work/t3work-recipeInlineActionChip";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

const iconByName = {
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  bug: Bug,
  "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList,
  "code-2": Code2,
  "life-buoy": LifeBuoy,
  "list-filter": ListFilter,
  "list-todo": ListTodo,
  "message-square": MessageSquare,
  newspaper: Newspaper,
  search: Search,
  ship: Ship,
  sparkles: Sparkles,
  "triangle-alert": TriangleAlert,
} as const;

function resolveRecipeActionIcon(icon: string | undefined) {
  if (!icon) {
    return Sparkles;
  }

  return iconByName[icon as keyof typeof iconByName] ?? Sparkles;
}

function RecipeAction(props: {
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly description?: ReactNode;
  readonly icon?: string;
  readonly eyebrow?: ReactNode;
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
}) {
  const Icon = resolveRecipeActionIcon(props.icon);

  return (
    <div className="relative min-w-0 space-y-2 pr-7">
      <div className="absolute top-0.5 right-0 flex size-5 items-center justify-center text-muted-foreground/45">
        <Icon className="size-3.5" />
      </div>
      {props.eyebrow ? (
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
          {props.eyebrow}
        </div>
      ) : null}
      <div>
        <div className="text-sm font-medium text-foreground/90">{props.title}</div>
        {props.subtitle ? (
          <div className="mt-1 text-xs leading-5 text-muted-foreground/80">{props.subtitle}</div>
        ) : null}
        {props.description ? (
          <div className="mt-2 text-xs leading-5 text-muted-foreground/80">{props.description}</div>
        ) : null}
      </div>
      {props.children ? <div className="space-y-2">{props.children}</div> : null}
      {props.footer ? <div>{props.footer}</div> : null}
    </div>
  );
}

function FieldList(props: {
  readonly items: ReadonlyArray<{ label: ReactNode; value: ReactNode }>;
}) {
  return (
    <dl className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
      {props.items.map((item, index) => (
        <div key={`${String(item.label)}-${index}`} className="space-y-0.5">
          <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            {item.label}
          </dt>
          <dd className="text-xs leading-5 text-foreground/80">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SourceLink(props: { readonly label: ReactNode; readonly href?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/80">
      <Link2 className="size-3.5" />
      <span>{props.label}</span>
    </span>
  );
}

function ArtifactLink(props: { readonly label: ReactNode; readonly href?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
      <ArrowUpRight className="size-3.5 text-muted-foreground" />
      <span>{props.label}</span>
    </span>
  );
}

function RiskPill(props: { readonly level?: string; readonly children?: ReactNode }) {
  const label = props.children ?? props.level ?? "Risk";
  const normalizedLevel = typeof props.level === "string" ? props.level.toLowerCase() : "";
  const variant =
    normalizedLevel.includes("critical") || normalizedLevel.includes("high")
      ? "warning"
      : normalizedLevel.includes("low")
        ? "outline"
        : "secondary";

  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}

function JiraInlineIssue(props: {
  readonly displayId: string;
  readonly title?: ReactNode;
  readonly issueType?: string;
  readonly issueTypeIconUrl?: string;
  readonly status?: string;
  readonly priority?: string;
  readonly meta?: ReactNode;
}) {
  return <RecipeActionIssuePreview {...props} />;
}

export const recipeActionViewComponents = {
  ArtifactLink,
  Badge,
  FieldList,
  InlineActionChip,
  JiraInlineIssue,
  LaunchOptionGroup,
  LaunchTextInput,
  RecipeAction,
  RiskPill,
  SourceLink,
};

export function DefaultRecipeQuickStartBody({ recipe }: { recipe: T3workSidecarRecipeQuickStart }) {
  return (
    <>
      <div className="text-sm font-medium text-foreground/90">{recipe.title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground/80">{recipe.description}</p>
    </>
  );
}
