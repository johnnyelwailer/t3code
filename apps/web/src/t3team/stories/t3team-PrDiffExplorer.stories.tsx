import type { FileDiffContentsLoader } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs/utils/parsePatchFiles";
import type { Meta, StoryObj } from "@storybook/react";
import type * as React from "react";

import { PullRequestDiffExplorer } from "~/components/pullRequest/PullRequestDiffExplorer";
import { generateSamplePatch, sampleFileContents } from "./t3team-PrDiffExplorer.sample";

const parsedFiles = parsePatchFiles(generateSamplePatch(), "t3team-pr-diff-explorer-story").flatMap(
  (patch) => patch.files,
);

/** The host's full-file answer, so the viewer can show the whole file instead of just hunks. */
const loadDiffFiles: FileDiffContentsLoader = async (fileDiff) => {
  const newPath = (fileDiff.name ?? "").replace(/^b\//, "");
  const oldPath = (fileDiff.prevName ?? fileDiff.name ?? "").replace(/^a\//, "");
  const contents = sampleFileContents(newPath);
  return {
    oldFile: {
      name: oldPath,
      contents: contents.oldContents,
      cacheKey: `story:old:${oldPath}`,
    },
    newFile: {
      name: newPath,
      contents: contents.newContents,
      cacheKey: `story:new:${newPath}`,
    },
  };
};

export default {
  title: "PullRequest/Diff Explorer (prototype)",
  component: PullRequestDiffExplorer,
  tags: ["autodocs"],
} satisfies Meta<typeof PullRequestDiffExplorer>;

const Story = (props: Partial<React.ComponentProps<typeof PullRequestDiffExplorer>> = {}) => (
  // A fixed-height viewport: like the real Code tab, the panes scroll inside this box
  // instead of growing the page.
  <div className="h-[78vh] min-h-[480px] overflow-hidden rounded-lg border border-border/60">
    <PullRequestDiffExplorer
      files={parsedFiles}
      loadDiffFiles={loadDiffFiles}
      storageKey="story"
      {...props}
    />
  </div>
);

export const FocusMode: StoryObj = {
  render: (args) => (
    <Story {...(args as Partial<React.ComponentProps<typeof PullRequestDiffExplorer>>)} />
  ),
};

export const AllFiles: StoryObj = {
  render: (args) => (
    <Story {...(args as Partial<React.ComponentProps<typeof PullRequestDiffExplorer>>)} />
  ),
};
