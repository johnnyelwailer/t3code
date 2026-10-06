/**
 * Dispatch-layer tool-name aliases. `McpServer.toolkit` lists every registered tool, so an alias
 * registered as a tool would be advertised to the model. Instead the protocol adapter is wrapped:
 * `tools/list` is untouched, and `tools/call` rewrites a deprecated name to its replacement before
 * the core looks the handler up (so capability gates, the author scope and results are identical).
 */
import * as Effect from "effect/Effect";
import type { McpProtocol } from "effect/ai";

/** The replacement for a deprecated tool name; any other name is returned as-is. */
export const resolveToolNameAlias = (
  aliases: Readonly<Record<string, string>>,
  name: string,
): string => (Object.hasOwn(aliases, name) ? (aliases[name] ?? name) : name);

// `ProtocolAdapter` erases its handler requirements to `unknown`; the wrapper adds none.
// The core's call result is opaque here: forwarded untouched, its errors never inspected.
type CoreCall = (
  call: { readonly name: string },
  invocation: unknown,
) => Effect.Effect<unknown, Error>;
type InstallHandlers = (core: any, lifecycle: unknown, target: unknown) => Effect.Effect<void>;

export const withToolNameAliases = <Version extends McpProtocol.ProtocolVersion>(
  adapter: McpProtocol.ProtocolAdapter<Version>,
  aliases: Readonly<Record<string, string>>,
): McpProtocol.ProtocolAdapter<Version> => ({
  ...adapter,
  installHandlers: (core, lifecycle, target) =>
    (adapter.installHandlers as InstallHandlers)(
      {
        ...core,
        tools: {
          ...core.tools,
          call: ((call, invocation) => {
            const name = resolveToolNameAlias(aliases, call.name);
            const forward = core.tools.call as CoreCall;
            return name === call.name
              ? forward(call, invocation)
              : Effect.logInfo(`MCP tool '${call.name}' is deprecated; use '${name}'`).pipe(
                  Effect.andThen(forward({ ...call, name }, invocation)),
                );
          }) satisfies CoreCall,
        },
      },
      lifecycle,
      target,
    ),
});
