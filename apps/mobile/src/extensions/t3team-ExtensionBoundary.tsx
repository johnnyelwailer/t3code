import { Component, type ReactNode } from "react";

/**
 * Isolates a distribution slot: when it throws while rendering, the slot is omitted instead of the
 * route-level boundary replacing the whole screen. `onFailure` lets the host screen fall back to
 * its stock content.
 */
export class ExtensionBoundary extends Component<
  { readonly children: ReactNode; readonly onFailure?: () => void },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn("A distribution slot failed to render and was omitted.", error);
    this.props.onFailure?.();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
