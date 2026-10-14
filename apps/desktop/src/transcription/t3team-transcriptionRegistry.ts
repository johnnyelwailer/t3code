import type { TranscriptionEngine } from "./t3team-transcriptionEngine.ts";
import type {
  TranscriptionEngineSummary,
  TranscriptionStatus,
} from "./t3team-transcriptionProtocol.ts";

/**
 * Registry of transcription engines plus the selection rule:
 *   1. the configured preferred engine, when it is registered and available;
 *   2. otherwise the first available native engine (the default: OS speech-to-text);
 *   3. otherwise the first available custom engine.
 */
export class TranscriptionRegistry {
  private readonly engines = new Map<string, TranscriptionEngine>();
  private preferredId: string | null = null;

  register(engine: TranscriptionEngine): () => void {
    this.engines.set(engine.id, engine);
    return () => {
      if (this.engines.get(engine.id) === engine) this.engines.delete(engine.id);
    };
  }

  setPreferred(id: string | null): void {
    this.preferredId = id;
  }

  get(id: string): TranscriptionEngine | undefined {
    return this.engines.get(id);
  }

  list(): ReadonlyArray<TranscriptionEngine> {
    return [...this.engines.values()];
  }

  async status(locale?: string): Promise<TranscriptionStatus> {
    const engines: TranscriptionEngineSummary[] = await Promise.all(
      this.list().map(async (engine) => {
        try {
          const probe = await engine.probe(locale);
          return { id: engine.id, label: engine.label, kind: engine.kind, ...probe };
        } catch (error) {
          return {
            id: engine.id,
            label: engine.label,
            kind: engine.kind,
            available: false,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    const engineId = selectEngineId(engines, this.preferredId);
    return { available: engineId !== null, engineId, engines };
  }
}

export function selectEngineId(
  engines: ReadonlyArray<TranscriptionEngineSummary>,
  preferredId: string | null,
): string | null {
  const available = engines.filter((engine) => engine.available);
  const preferred = preferredId ? available.find((engine) => engine.id === preferredId) : undefined;
  if (preferred) return preferred.id;
  return (
    available.find((engine) => engine.kind === "native")?.id ??
    available.find((engine) => engine.kind === "custom")?.id ??
    null
  );
}
