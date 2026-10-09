/**
 * Every `pack-ui` primitive, imported the way a pack imports it. Pack code: it may import only
 * `react`, `effect`, `@t3team/pack-ui` and its own files.
 */
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Icon,
  Markdown,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  WidgetFrame,
  type MessageViewProps,
  type PackWidget,
} from "@t3team/pack-ui";

import { KitShowcaseOverlays } from "./t3team-KitShowcaseOverlays";

const MARKDOWN = [
  "**Markdown** with `code`, a [safe link](https://example.com) and a",
  "[local file](file:///etc/hosts) that renders as text. <b>Raw HTML</b> stays text.",
].join(" ");

const WIDGET: PackWidget = {
  widgetId: "kitfixture-swatch",
  title: "Theme swatch",
  format: "svg",
  html: '<svg viewBox="0 0 120 24" width="120" height="24"><rect width="120" height="24" rx="4" fill="var(--color-primary, currentColor)"/></svg>',
};

const ROWS = [
  { step: "Outline", state: "success", label: "Done" },
  { step: "Build steps", state: "warning", label: "Partial" },
  { step: "Verify", state: "info", label: "Queued" },
] as const;

export function KitShowcase({ title }: { title: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Icon name="sparkles" className="size-4 text-primary" />
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="success" size="sm">
          ready
        </Badge>
        <Spinner size="sm" tone="muted" aria-label="Loading" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="xs">
          <Icon name="play" />
          Play
        </Button>
        <Button variant="outline" size="xs">
          <Icon name="refresh-cw" />
          Regenerate
        </Button>
        <Button variant="ghost-muted" size="icon-micro" aria-label="Close">
          <Icon name="x" />
        </Button>
      </div>
      <Alert variant="warning">
        <Icon name="triangle-alert" />
        <AlertTitle>AI-generated from untrusted content</AlertTitle>
        <AlertDescription>Check every claim against the change itself.</AlertDescription>
      </Alert>
      <Markdown text={MARKDOWN} size="compact" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Step</TableHead>
            <TableHead className="w-24 text-right">State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map((row) => (
            <TableRow key={row.step}>
              <TableCell>{row.step}</TableCell>
              <TableCell className="text-right">
                <Badge variant={row.state} size="sm">
                  {row.label}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-16 w-full" shape="card" />
      </div>
      <Textarea size="compact" placeholder="Ask about this…" aria-label="Question" />
      <KitShowcaseOverlays />
      <WidgetFrame widget={WIDGET} threadRef={null} />
    </div>
  );
}

/** The showcase as a `message.view`. */
export function KitShowcaseView({ props }: MessageViewProps<{ readonly title: string }>) {
  return <KitShowcase title={props.title} />;
}
