import type { Meta, StoryObj } from "@storybook/react";

import { cn } from "~/t3team/lib/t3team-utils";
import {
  T3TeamDiffGutter,
  T3TeamDiffText,
  type T3TeamDiffSegment,
} from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";
import {
  flattenDiffSegmentKinds,
  isWholeBlockChange,
} from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";

type BlockState = "add" | "del" | "edit" | undefined;

/** Words and the gaps between them, as the word differ emits them. */
function tokenize(text: string, kind?: "add" | "del"): ReadonlyArray<T3TeamDiffSegment> {
  return text.split(/(\s+)/).map((token) => (kind ? { text: token, kind } : { text: token }));
}

/** Mirrors how `WorkItemDescriptionDraftDiff` draws one block, so the story shows the real rule. */
function DiffBlock({
  state,
  segments,
}: {
  readonly state: BlockState;
  readonly segments: ReadonlyArray<T3TeamDiffSegment>;
}) {
  const wholeBlock = isWholeBlockChange(state);
  return (
    <div className="group flex">
      <T3TeamDiffGutter {...(state ? { state } : {})} commentCount={0} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            wholeBlock && "border-l-2 pl-3",
            wholeBlock && state === "add" && "border-success",
            wholeBlock &&
              state === "del" &&
              "border-destructive text-muted-foreground line-through",
          )}
        >
          <T3TeamDiffText segments={wholeBlock ? flattenDiffSegmentKinds(segments) : segments} />
        </p>
      </div>
    </div>
  );
}

function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="max-w-2xl space-y-2.5 rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 text-foreground">
      {children}
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Diff Block Rendering",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The case that prompted the change: every token is new, so word-level marking points at nothing. It
 * renders as prose behind a left border, not as ~20 padded chips with marked spaces between them.
 */
export const AllAdded: Story = {
  render: () => (
    <Frame>
      <DiffBlock
        state="add"
        segments={tokenize(
          "Als Entwickler brauche ich eine klare Rollendefinition, damit ich weiss, welche Aufgaben ich verantworte.",
          "add",
        )}
      />
    </Frame>
  ),
};

/** Wholly removed: same treatment, destructive border, struck through. */
export const AllRemoved: Story = {
  render: () => (
    <Frame>
      <DiffBlock
        state="del"
        segments={tokenize("Dieser Absatz war veraltet und wird ersetzt.", "del")}
      />
    </Frame>
  ),
};

/**
 * Where word-level marking earns its keep: only the changed words are marked, and the spaces between
 * them are plain text — so the replacement is legible as a sentence.
 */
export const Mixed: Story = {
  render: () => (
    <Frame>
      <DiffBlock
        state="edit"
        segments={[
          ...tokenize("Der "),
          { text: "Agent", kind: "del" },
          ...tokenize(" "),
          { text: "Writer", kind: "add" },
          ...tokenize(" schlägt eine neue Beschreibung vor."),
        ]}
      />
    </Frame>
  ),
};

/** All three together — the comparison PJ is judging the surface by. */
export const AllCases: Story = {
  render: () => (
    <Frame>
      <DiffBlock state="add" segments={tokenize("Ein vollständig neuer Absatz.", "add")} />
      <DiffBlock state="del" segments={tokenize("Ein vollständig entfernter Absatz.", "del")} />
      <DiffBlock
        state="edit"
        segments={[
          ...tokenize("Ein "),
          { text: "kleiner", kind: "del" },
          ...tokenize(" "),
          { text: "gezielter", kind: "add" },
          ...tokenize(" Eingriff."),
        ]}
      />
      <DiffBlock state={undefined} segments={tokenize("Ein unveränderter Absatz.")} />
    </Frame>
  ),
};
