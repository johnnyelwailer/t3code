import { create } from "zustand";
import {
  isT3WorkDocumentDraftMutation,
  type T3WorkDocumentDraftMutation,
  type T3WorkDraftMutation,
  type T3WorkDraftMutationStatus,
} from "~/t3work/t3work-draftMutationTypes";

type T3WorkDraftMutationState = {
  readonly drafts: readonly T3WorkDraftMutation[];
  readonly upsertDrafts: (drafts: ReadonlyArray<T3WorkDraftMutation>) => void;
  readonly discardDraft: (draftId: string) => void;
  readonly removeDraft: (draftId: string) => void;
  readonly setDraftStatus: (
    draftId: string,
    status: T3WorkDraftMutationStatus,
    error?: string,
  ) => void;
};

function mergeDrafts(
  current: readonly T3WorkDraftMutation[],
  incoming: ReadonlyArray<T3WorkDraftMutation>,
): readonly T3WorkDraftMutation[] {
  if (incoming.length === 0) return current;
  const nextById = new Map(current.map((draft) => [draft.id, draft]));
  for (const draft of incoming) {
    nextById.set(draft.id, draft);
  }
  return [...nextById.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export const useT3WorkDraftMutationStore = create<T3WorkDraftMutationState>((set) => ({
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
  draft: T3WorkDraftMutation,
  status: T3WorkDraftMutationStatus,
  error: string | undefined,
): T3WorkDraftMutation {
  const { error: _previousError, ...rest } = draft;
  return error ? { ...rest, status, error } : { ...rest, status };
}

export function selectJiraDocumentDrafts(input: {
  readonly projectId?: string;
  readonly issueIdOrKey?: string;
}) {
  return (state: T3WorkDraftMutationState): readonly T3WorkDocumentDraftMutation[] =>
    state.drafts.filter((draft): draft is T3WorkDocumentDraftMutation => {
      if (!isT3WorkDocumentDraftMutation(draft)) return false;
      if (draft.status === "discarded" || draft.status === "applied") return false;
      if (input.projectId && draft.projectId && draft.projectId !== input.projectId) return false;
      if (input.issueIdOrKey && draft.target.issueIdOrKey !== input.issueIdOrKey) return false;
      return true;
    });
}
