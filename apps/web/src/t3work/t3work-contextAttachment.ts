export type T3WorkContextAttachment = {
  id: string;
  kind: string;
  label: string;
  dedupeKey?: string;
  description?: string;
  summaryItems?: ReadonlyArray<{ label: string; value: string }>;
  fileReferences?: ReadonlyArray<{ label: string; relativePath: string }>;
  contextText: string;
};
