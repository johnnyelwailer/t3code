import { vi } from "vite-plus/test";

// ThreadFeed reads the rich-choice rows through a hook that needs the connection runtime. Upstream
// tests render ThreadFeed with their own mocks and know nothing of it, so they get no rows; the
// tests of the rich-choice modules themselves call `vi.unmock` for the module they exercise.
vi.mock("./features/rich-choice/t3team-RichChoiceFeedRow", () => ({
  T3TeamRichChoiceFeedRow: () => null,
}));
vi.mock("./state/t3team-useRichChoiceFeedEntries", () => ({
  useT3TeamRichChoiceFeedEntries: () => [],
}));
