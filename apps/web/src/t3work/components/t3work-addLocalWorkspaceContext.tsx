import { createContext, use, type ReactNode } from "react";

const T3workAddLocalWorkspaceContext = createContext<() => void>(() => {});

export function T3workAddLocalWorkspaceProvider(props: {
  readonly children: ReactNode;
  readonly openAddLocalWorkspace: () => void;
}) {
  return (
    <T3workAddLocalWorkspaceContext value={props.openAddLocalWorkspace}>
      {props.children}
    </T3workAddLocalWorkspaceContext>
  );
}

export function useT3workAddLocalWorkspace(): () => void {
  return use(T3workAddLocalWorkspaceContext);
}
