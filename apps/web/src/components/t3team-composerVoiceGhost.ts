/**
 * The live dictation preview, inside the draft: a muted ghost of the words being spoken at the
 * end of the document — the exact place the committed text will land. The ghost is a ProseMirror
 * decoration: it renders in the text flow, wraps with it, and is never part of the document, so
 * it is never serialized, never sent, and never undoable.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const composerVoiceGhostPluginKey = new PluginKey("composer-voice-ghost");

const COMPOSER_VOICE_GHOST_META = "composer-voice-ghost-text";

export function updateVoiceGhost(transaction: Transaction, text: string): Transaction {
  return transaction.setMeta(COMPOSER_VOICE_GHOST_META, text);
}

function ghostSpan(): HTMLSpanElement {
  const ghost = document.createElement("span");
  ghost.className = "composer-voice-ghost text-muted-foreground/60 italic break-words";
  ghost.setAttribute("aria-hidden", "true");
  return ghost;
}

function ghostDecorationSet(state: EditorState): DecorationSet {
  const text = composerVoiceGhostPluginKey.getState(state);
  if (text === "") return DecorationSet.empty;
  const ghost = ghostSpan();
  ghost.textContent = text;
  // Where typed text lands at the end of the draft: inside the last text block, including
  // text blocks nested in rich blocks (quotes, list items). doc.content.size would place
  // the ghost after the last block, on its own line.
  const at = Selection.atEnd(state.doc).anchor;
  return DecorationSet.create(state.doc, [
    // The transcript in the key makes ProseMirror re-render the span when the partial
    // changes instead of reusing the first span's DOM.
    Decoration.widget(at, ghost, { side: 1, key: `composer-voice-ghost:${text}` }),
  ]);
}

export const ComposerVoiceGhostExtension = Extension.create({
  name: "composer-voice-ghost",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: composerVoiceGhostPluginKey,
        state: {
          init: () => "",
          apply: (tr, old) => {
            const next = tr.getMeta(COMPOSER_VOICE_GHOST_META);
            return typeof next === "string" ? next : old;
          },
        },
        props: {
          decorations: (state) => ghostDecorationSet(state),
        },
      }),
    ];
  },
});
