import { plain, type DiffSampleBlock } from "~/t3team/stories/t3team-workItemDiffSampleTypes";

export type { DiffSampleBlock };

/** The sample document itself. Types and the `plain` helper live alongside in -SampleTypes. */
export const DIFF_SAMPLE_BLOCKS: ReadonlyArray<DiffSampleBlock> = [
  {
    id: "summary",
    type: "paragraph",
    state: "edit",
    segments: [
      { text: "The nightly job pulls each supplier's catalogue export and writes it into the " },
      { text: "staging schema", kind: "del" },
      { text: "staging schema in one transaction per supplier", kind: "add" },
      { text: ". It " },
      { text: "should", kind: "del" },
      { text: "must", kind: "add" },
      { text: " accept " },
      { text: "CSV", kind: "del" },
      { text: "CSV and TSV", kind: "add" },
      { text: " up to " },
      { text: "50", kind: "del" },
      { text: "200", kind: "add" },
      { text: " MB and report progress every " },
      { text: "5", kind: "del" },
      { text: "2", kind: "add" },
      { text: " seconds so the operations dashboard does not look stalled." },
    ],
  },
  {
    id: "context",
    type: "paragraph",
    segments: plain(
      "Two suppliers (Brenner, Vasco) already exceed the current ceiling and fall back to a manual upload every Monday, which is where most of the reconciliation errors come from.",
    ),
  },

  /* Everything below the collapsed region. */
  {
    id: "status",
    type: "lozenges",
    state: "edit",
    label: "Rollout state",
    from: "BLOCKED",
    to: "READY",
  },
  {
    id: "owners",
    type: "paragraph",
    state: "edit",
    segments: [
      { text: "Owner for the rollout is " },
      { text: "Ada Lovelace", kind: "del" },
      { text: "Bo Meyer", kind: "add" },
      { text: ", with the platform team signing off the migration window." },
    ],
  },
  { id: "criteria-heading", type: "heading", text: "Acceptance criteria" },
  {
    id: "criteria-1",
    type: "bullet",
    segments: plain("A malformed row is skipped and counted, never aborting the run."),
  },
  {
    id: "criteria-2",
    type: "bullet",
    state: "edit",
    segments: [
      { text: "Duplicate SKUs within one file resolve to the " },
      { text: "first", kind: "del" },
      { text: "last", kind: "add" },
      { text: " occurrence." },
    ],
  },
  {
    id: "criteria-3",
    type: "bullet",
    state: "add",
    segments: plain("A cancelled import leaves no partial rows in staging."),
  },
  {
    id: "criteria-4",
    type: "bullet",
    state: "del",
    segments: plain("Performance targets are TBD and will be agreed with the platform team."),
  },
  { id: "screens-heading", type: "heading", text: "Screens" },
  {
    id: "screens",
    type: "media",
    items: [
      { label: "importer-old.png", kind: "image", state: "del" },
      { label: "importer-progress.png", kind: "image", state: "add" },
      { label: "cancel-confirm.png", kind: "image" },
      { label: "walkthrough.mp4", kind: "video", state: "edit" },
    ],
  },
  { id: "budget-heading", type: "heading", text: "Performance budget per 10k rows" },
  {
    id: "budget",
    type: "table",
    columns: ["Stage", "Budget", "Owner"],
    rows: [
      {
        cells: [
          plain("Parse"),
          [{ text: "400", kind: "del" }, { text: "150", kind: "add" }, { text: " ms" }],
          plain("Platform"),
        ],
      },
      { cells: [plain("Stage write"), plain("900 ms"), plain("Platform")] },
      { state: "add", cells: [plain("Dedupe"), plain("120 ms"), plain("Data")] },
    ],
  },
  {
    id: "chunking",
    type: "code",
    lines: [
      { text: "const rows = await parseCatalogue(file);" },
      { text: "if (rows.length > MAX_ROWS) throw new TooLarge();", state: "del" },
      { text: "if (rows.length > MAX_ROWS) return chunk(rows, MAX_ROWS);", state: "add" },
      { text: "return stage(rows);" },
    ],
  },
  {
    id: "warning",
    type: "panel",
    state: "edit",
    segments: [
      { text: "Do not run this against production before " },
      { text: "the platform team has signed off", kind: "del" },
      { text: "the dedupe stage has a rollback", kind: "add" },
      { text: "." },
    ],
  },
  { id: "embed", type: "embed", state: "edit", label: "Roadmap planner embed" },
];

/** Unchanged prose, hidden until the reader asks for it. */
export const DIFF_SAMPLE_HIDDEN: ReadonlyArray<DiffSampleBlock> = [
  {
    id: "hidden-1",
    type: "paragraph",
    segments: plain(
      "Exports arrive on the SFTP drop between 01:00 and 03:00 CET. Filenames follow supplier-YYYYMMDD.csv and are not guaranteed unique, so the importer keys on the content hash rather than the name.",
    ),
  },
  {
    id: "hidden-2",
    type: "paragraph",
    segments: plain(
      "Column order varies by supplier. The header row is authoritative; a file without one is rejected outright rather than guessed at, because a silent column shift corrupts prices without failing.",
    ),
  },
  {
    id: "hidden-3",
    type: "paragraph",
    segments: plain(
      "Currency is assumed to be CHF unless a currency column is present. Vasco send EUR without declaring it, which is tracked separately in KOOR-1502.",
    ),
  },
];
