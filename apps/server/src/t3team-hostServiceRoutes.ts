import { AuthEnvironmentMaintainScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpServerRequest } from "effect/http";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { credentialRoute } from "./t3team-credentialRoute.ts";
import { HostServices } from "./t3team-hostServices.ts";
import { hostServiceCaller } from "./t3team-hostServiceCaller.ts";
import { HostServiceError, hostServiceError } from "./t3team-hostServiceError.ts";

const route = (method: "GET" | "POST") =>
  credentialRoute({
    method,
    path: "/api/t3team/host-services/*",
    scope: AuthEnvironmentMaintainScope,
    handler: Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const match = new URL(request.url, "http://local").pathname.match(
        /^\/api\/t3team\/host-services\/([a-z][a-z0-9._-]*)\/(.*)$/,
      );
      if (!match) return yield* new HostServiceError({ message: "Unknown host service" });
      const body =
        method === "POST" ? yield* HttpServerRequest.schemaBodyJson(Schema.Unknown) : undefined;
      // The server's own view of who is asking: the service decides what that caller may do.
      const session = yield* (yield* EnvironmentAuth.EnvironmentAuth).authenticateHttpRequest(
        request,
      );
      return yield* (yield* HostServices).request(
        match[1]!,
        method,
        match[2]!,
        body,
        hostServiceCaller(session),
      );
    }).pipe(Effect.mapError(hostServiceError)),
    onError: (error: HostServiceError) => ({
      error: "host_service_failed",
      message: error.message,
    }),
  });

export const hostServiceRoutes = Layer.mergeAll(route("GET"), route("POST"));
