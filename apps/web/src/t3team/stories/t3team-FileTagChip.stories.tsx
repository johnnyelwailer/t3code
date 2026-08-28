/* oxlint-disable t3code/no-native-title-tooltip -- The T3Team row story intentionally mirrors ThreadRow's native title tooltip. */
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { FileTagChipContent } from "~/components/chat/FileTagChip";

/**
 * Arbitrary-file attachment chip (composer + user message timeline).
 *
 * The composer now accepts any file, not just images: non-images attach as
 * `type: "file"`, upload through the same attachment store, and the agent
 * reads them through the provider's `[Attached file … is saved at: path]`
 * line. The chip is the only visual: no pixel preview, just the sprite
 * icon inferred from the file name plus the file name.
 *
 * - Composer surface: the chip inside the composer row while the upload
 *   runs and afterwards (icon + name, no preview thumbnail).
 * - Message timeline surface: the file chip row rendered above a user
 *   message whose attachments include `type: "file"` (exact production
 *   markup from `MessagesTimeline.tsx`).
 *
 * The app uses class-based dark mode, so the dark variants toggle the
 * `.dark` class on the document root (same convention as the AdfRenderer
 * stories) instead of relying on `prefers-color-scheme`.
 */

const samples = [
  { path: "notes.txt", label: "notes.txt" },
  { path: "spec.pdf", label: "spec.pdf" },
  { path: "attachment.ts", label: "attachment.ts" },
  {
    path: "very-long-release-candidate-build-42-2026-08-27-final-final.bin",
    label: "very-long-release-candidate-build-42-2026-08-27-final-final.bin",
  },
] as const;

type ThemeMode = "light" | "dark";

function useStoryTheme(mode: ThemeMode) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    return () => document.documentElement.classList.remove("dark");
  }, [mode]);
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function FileChipRow({ theme }: { theme: ThemeMode }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {samples.map((sample) => (
        <div
          key={sample.path}
          className="inline-flex max-w-xs items-center gap-1.5 rounded-md border border-border/80 bg-background/70 px-2 py-1 text-xs"
          title={`${sample.label} (${sample.path.length} bytes)`}
        >
          <FileTagChipContent path={sample.path} label={sample.label} theme={theme} />
        </div>
      ))}
    </div>
  );
}

function ComposerChipFrame({ theme }: { theme: ThemeMode }) {
  useStoryTheme(theme);
  return (
    <Card title="Composer (upload pending → sent)">
      <FileChipRow theme={theme} />
    </Card>
  );
}

function MessageTimelineFrame({ theme }: { theme: ThemeMode }) {
  useStoryTheme(theme);
  return (
    <Card title="User message timeline">
      <FileChipRow theme={theme} />
      <div className="mt-3 text-sm text-foreground">
        Here are the notes and the spec — check the build log against both.
      </div>
    </Card>
  );
}

const meta = {
  title: "T3Team/Composer/Attachment File Chip",
  component: FileTagChipContent,
  argTypes: {
    theme: { control: "select", options: ["light", "dark"] },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<{ theme: ThemeMode }>;

/** Composer surface: file chips sit in the composer row while uploads run. */
export const ComposerChips: Story = {
  render: (args) => <ComposerChipFrame theme={args.theme} />,
  args: { theme: "light" },
};

export const ComposerChipsDark: Story = {
  render: (args) => <ComposerChipFrame theme={args.theme} />,
  args: { theme: "dark" },
};

/** Message timeline surface: file chips render above the user message text. */
export const MessageTimelineChips: Story = {
  render: (args) => <MessageTimelineFrame theme={args.theme} />,
  args: { theme: "light" },
};

export const MessageTimelineChipsDark: Story = {
  render: (args) => <MessageTimelineFrame theme={args.theme} />,
  args: { theme: "dark" },
};

/**
 * Long file names: the chip caps its width and truncates; the full name is
 * carried by the tooltip title.
 */
export const LongNamesTruncate: Story = {
  render: (args) => <MessageTimelineFrame theme={args.theme} />,
  args: { theme: "light" },
};
