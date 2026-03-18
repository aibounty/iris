import type { FastifyInstance } from "fastify";

export async function registerTagRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/tags", async (_request, _reply) => {
    const tags = app.tagRepo.listTags();
    return { tags };
  });
}
