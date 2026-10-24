import type { HostService, HostServiceDefinition } from "@t3team/pack-api";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServer } from "effect/http";
import { hostServiceDefinitions } from "./t3team-hostServiceRegistry.ts";
import { HostServiceError, hostServiceError } from "./t3team-hostServiceError.ts";
import { makeHostServiceContext } from "./t3team-hostServiceContext.ts";

export class HostServices extends Context.Service<
  HostServices,
  {
    readonly start: (port: number) => Effect.Effect<void>;
    readonly request: (
      id: string,
      method: "GET" | "POST",
      path: string,
      body: unknown,
    ) => Effect.Effect<unknown, HostServiceError>;
  }
>()("t3/t3team-hostServices/HostServices") {}

const make = Effect.fn("hostServices.make")(function* (
  definitions: ReadonlyArray<HostServiceDefinition>,
) {
  const contextFor = yield* makeHostServiceContext;
  const services = new Map<string, HostService>();
  yield* Effect.addFinalizer(() =>
    Effect.forEach(
      services.values(),
      (service) =>
        Effect.promise(async () => {
          await service.close();
        }),
      { discard: true },
    ),
  );
  return HostServices.of({
    start: Effect.fn("hostServices.start")(function* (port) {
      for (const definition of definitions) {
        if (services.has(definition.id)) continue;
        const context = yield* contextFor(definition.id, port);
        yield* Effect.tryPromise({
          try: () => definition.start(context),
          catch: hostServiceError,
        }).pipe(
          Effect.tap((service) => Effect.sync(() => services.set(definition.id, service))),
          Effect.catch((error) =>
            Effect.logWarning("Host service could not start", {
              id: definition.id,
              error: error.message,
            }),
          ),
        );
      }
    }),
    request: (id, method, path, body) =>
      Effect.tryPromise({
        try: async () => {
          const service = services.get(id);
          if (!service) throw new Error("Host service is unavailable");
          return service.request(method, path, body);
        },
        catch: hostServiceError,
      }),
  });
});

export const layerForHostServices = (definitions: ReadonlyArray<HostServiceDefinition>) =>
  Layer.effect(HostServices, make(definitions));
const layer = Layer.suspend(() => layerForHostServices(hostServiceDefinitions()));

export const withHostServices = <A, E, R>(base: Layer.Layer<A, E, R>) =>
  Layer.mergeAll(base, layer.pipe(Layer.provide(base)));

export const startHostServices = Effect.gen(function* () {
  const server = yield* HttpServer.HttpServer;
  if (!("port" in server.address)) return;
  yield* (yield* HostServices).start(server.address.port);
});
