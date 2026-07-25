import { flushSync } from "react-dom";

const ROOT_TRANSITION_TYPES_ATTRIBUTE = "data-t3team-view-transition-types";
const ROOT_TRANSITION_TOKEN_ATTRIBUTE = "data-t3team-view-transition-token";

let nextRootTransitionToken = 0;

type RunT3TeamViewTransitionOptions = {
  readonly types?: ReadonlyArray<string>;
};

type ViewTransitionStartOptions = {
  update: () => void;
  types?: ReadonlyArray<string>;
};

type ViewTransitionResult = {
  finished?: PromiseLike<unknown>;
};

type ViewTransitionCapableDocument = Document & {
  startViewTransition?: {
    (update: () => void): ViewTransitionResult;
    (options: ViewTransitionStartOptions): ViewTransitionResult;
  };
};

function withRootTransitionTypes(
  document: Document | undefined,
  types: ReadonlyArray<string> | undefined,
): (() => void) | undefined {
  if (!document || !types?.length) {
    return undefined;
  }

  const rootElement = document.documentElement;
  const token = String(++nextRootTransitionToken);
  rootElement.setAttribute(ROOT_TRANSITION_TYPES_ATTRIBUTE, types.join(" "));
  rootElement.setAttribute(ROOT_TRANSITION_TOKEN_ATTRIBUTE, token);

  return () => {
    if (rootElement.getAttribute(ROOT_TRANSITION_TOKEN_ATTRIBUTE) !== token) {
      return;
    }
    rootElement.removeAttribute(ROOT_TRANSITION_TYPES_ATTRIBUTE);
    rootElement.removeAttribute(ROOT_TRANSITION_TOKEN_ATTRIBUTE);
  };
}

export function runT3TeamViewTransition<T>(
  update: () => T,
  options?: RunT3TeamViewTransitionOptions,
): T {
  const document = globalThis.document as ViewTransitionCapableDocument | undefined;
  const startViewTransition = document?.startViewTransition?.bind(document);
  const dedupedTypes = options?.types?.length ? [...new Set(options.types)] : undefined;

  let result!: T;
  const applyUpdate = () => {
    flushSync(() => {
      result = update();
    });
  };

  if (typeof startViewTransition !== "function") {
    applyUpdate();
    return result;
  }

  const cleanupRootTransitionTypes = withRootTransitionTypes(document, dedupedTypes);

  try {
    const transition = startViewTransition(() => {
      applyUpdate();
    });

    if (cleanupRootTransitionTypes) {
      void transition.finished?.finally(() => {
        cleanupRootTransitionTypes();
      });
    }
  } catch {
    cleanupRootTransitionTypes?.();
    applyUpdate();
  }

  return result;
}
