import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/health", async (_request, _reply) => {
    const count = app.sessionRepo.count();
    return {
      status: "ok",
      version: "0.1.0",
      sessions_count: count,
      auth_token: app.appOptions.authToken ?? null,
    };
  });
}
