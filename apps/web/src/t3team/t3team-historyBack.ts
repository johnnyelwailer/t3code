export function navigateBackWithFallback(input: { canGoBack: boolean; onFallback: () => void }) {
  if (input.canGoBack && typeof window !== "undefined") {
    window.history.back();
    return;
  }

  input.onFallback();
}
