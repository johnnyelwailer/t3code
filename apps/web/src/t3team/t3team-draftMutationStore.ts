import { create } from "zustand";
import {
  isT3TeamDocumentDraftMutation,
  type T3TeamDocumentDraftMutation,
  type T3TeamDraftMutation,
  type T3TeamDraftMutationStatus,
} from "~/t3team/t3team-draftMutationTypes";

type T3TeamDraftMutationState = {
  readonly drafts: readonly T3TeamDraftMutation[];
  readonly upsertDrafts: (drafts: ReadonlyArray<T3TeamDraftMutation>) => void;
  readonly discardDraft: (draftId: string) => void;
  readonly removeDraft: (draftId: string) => void;
  readonly setDraftStatus: (
    draftId: string,
    status: T3TeamDraftMutationStatus,
    error?: string,
  ) => void;
};

function mergeDrafts(
  current: readonly T3TeamDraftMutation[],
  incoming: ReadonlyArray<T3TeamDraftMutation>,
): readonly T3TeamDraftMutation[] {
  if (incoming.length === 0) return current;
  const nextById = new Map(current.map((draft) => [draft.id, draft]));
  for (const draft of incoming) {
    nextById.set(draft.id, draft);
  }
  return [...nextById.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export const useT3TeamDraftMutationStore = create<T3TeamDraftMutationState>((set) => ({
  drafts: [],
  upsertDrafts: (drafts) => {
    set((state) => ({ drafts: mergeDrafts(state.drafts, drafts) }));
  },
  discardDraft: (draftId) => {
    set((state) => ({
      drafts: state.drafts.map((draft) =>
        draft.id === draftId ? { ...draft, status: "discarded" } : draft,
      ),
    }));
  },
  removeDraft: (draftId) => {
    set((state) => ({ drafts: state.drafts.filter((draft) => draft.id !== draftId) }));
  },
  setDraftStatus: (draftId, status, error) => {
    set((state) => ({
      drafts: state.drafts.map((draft) =>
        draft.id === draftId ? setDraftStatusFields(draft, status, error) : draft,
      ),
    }));
  },
}));

function setDraftStatusFields(
  draft: T3TeamDraftMutation,
  status: T3TeamDraftMutationStatus,
  error: string | undefined,
): T3TeamDraftMutation {
  const { error: _previousError, ...rest } = draft;
  return error ? { ...rest, status, error } : { ...rest, status };
}

export function selectJiraDocumentDrafts(input: {
  readonly projectId?: string;
  readonly issueIdOrKey?: string;
}) {
  return (state: T3TeamDraftMutationState): readonly T3TeamDocumentDraftMutation[] =>
    state.drafts.filter((draft): draft is T3TeamDocumentDraftMutation => {
      if (!isT3TeamDocumentDraftMutation(draft)) return false;
      if (draft.status === "discarded" || draft.status === "applied") return false;
      if (input.projectId && draft.projectId && draft.projectId !== input.projectId) return false;
      if (input.issueIdOrKey && draft.target.issueIdOrKey !== input.issueIdOrKey) return false;
      return true;
    });
}
