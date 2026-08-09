import { Component, type ReactNode } from "react";

import { T3TeamErrorState, type T3TeamErrorStateVariant } from "./t3team-ErrorState";

type T3TeamErrorBoundaryProps = {
  readonly children: ReactNode;
  readonly action?: string;
  readonly variant?: T3TeamErrorStateVariant;
  readonly onReset?: () => void;
  readonly fallback?: (error: unknown, reset: () => void) => ReactNode;
};

type T3TeamErrorBoundaryState = {
  readonly error: { readonly value: unknown } | null;
};

/**
 * Generic error boundary for t3team sections: renders `T3TeamErrorState` (or a
 * caller-supplied `fallback`) so one failing section can't take down the page.
 */
export class T3TeamErrorBoundary extends Component<
  T3TeamErrorBoundaryProps,
  T3TeamErrorBoundaryState
> {
  override state: T3TeamErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): T3TeamErrorBoundaryState {
    return { error: { value: error } };
  }

  override componentDidCatch(error: unknown) {
    console.error("[t3team] T3TeamErrorBoundary caught an error:", error);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error.value, this.reset);
    }

    return (
      <T3TeamErrorState
        error={error.value}
        {...(this.props.action ? { action: this.props.action } : {})}
        {...(this.props.variant ? { variant: this.props.variant } : {})}
        onRetry={this.reset}
      />
    );
  }
}
