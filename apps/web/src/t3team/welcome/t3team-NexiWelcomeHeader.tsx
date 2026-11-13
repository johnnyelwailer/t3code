import { useWelcomeWizardBrand } from "~/t3team/onboarding/t3team-welcomeWizardBrand";

/** Brand and one plain line on what the page is for; the page owns the whole window. */
export function NexiWelcomeHeader() {
  const { productName, identity } = useWelcomeWizardBrand();
  return (
    <header className="mb-6 space-y-2">
      {identity ?? <p className="text-2xl font-medium tracking-tight">{productName}</p>}
      <h1 className="sr-only">Welcome to {productName}</h1>
      <p className="text-sm text-muted-foreground">
        Connect what you use. Skip anything for now; you can finish it later in Settings.
      </p>
    </header>
  );
}
