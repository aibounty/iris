import type { FastifyRequest, FastifyReply } from "fastify";

export function createAuthHook(options: {
  authToken?: string;
  readonly?: boolean;
}) {
  return async function authHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Check readonly mode
    if (options.readonly) {
      return reply.code(403).send({
        error: "Server is in read-only mode",
      });
    }

    // If no token configured, allow all (dev mode)
    if (!options.authToken) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({ error: "Authorization required" });
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/);
    if (!match || match[1] !== options.authToken) {
      return reply.code(401).send({ error: "Invalid token" });
    }
  };
}
