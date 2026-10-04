/**
 * Distribution text-generation pin (`defineModelPolicy({ textGenerationModelSelection })`).
 *
 * The TextGeneration router applies it to every settings-derived generator (commit messages, PR
 * content, branch names, thread titles, activity labels), whatever selection the caller resolved:
 * neither the user's source-control writer model nor a per-project override can send generated
 * text to another provider. `generateStructured` is left alone; its callers (child status, workflow
 * repair) pick the model through the workflow agent / repair model policies.
 *
 * @module t3team-textGenerationModelPin
 */
import type { ModelSelection } from "@t3tools/contracts";

import { getConfiguredTextGenerationModelSelection } from "../t3team-configuredDefaultModelSelection.ts";
import type { TextGeneration } from "./TextGeneration.ts";

type TextGenerationShape = TextGeneration["Service"];

const pinned = <I extends { readonly modelSelection: ModelSelection }>(input: I): I => {
  const selection = getConfiguredTextGenerationModelSelection();
  return selection === undefined ? input : { ...input, modelSelection: selection };
};

export const withPinnedTextGenerationModel = (
  service: TextGenerationShape,
): TextGenerationShape => {
  const { generateActivityLabel } = service;
  return {
    ...service,
    generateCommitMessage: (input) => service.generateCommitMessage(pinned(input)),
    generatePrContent: (input) => service.generatePrContent(pinned(input)),
    generateBranchName: (input) => service.generateBranchName(pinned(input)),
    generateThreadTitle: (input) => service.generateThreadTitle(pinned(input)),
    ...(generateActivityLabel === undefined
      ? {}
      : { generateActivityLabel: (input) => generateActivityLabel(pinned(input)) }),
  };
};
