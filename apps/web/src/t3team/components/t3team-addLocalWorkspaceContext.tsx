import { createContext, use, type ReactNode } from "react";

const T3TeamAddLocalWorkspaceContext = createContext<() => void>(() => {});

export function T3TeamAddLocalWorkspaceProvider(props: {
  readonly children: ReactNode;
  readonly openAddLocalWorkspace: () => void;
}) {
  return (
    <T3TeamAddLocalWorkspaceContext value={props.openAddLocalWorkspace}>
      {props.children}
    </T3TeamAddLocalWorkspaceContext>
  );
}

export function useT3TeamAddLocalWorkspace(): () => void {
  return use(T3TeamAddLocalWorkspaceContext);
}
