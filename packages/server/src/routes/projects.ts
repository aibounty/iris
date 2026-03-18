import type { FastifyInstance } from "fastify";

export async function registerProjectRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/projects", async (_request, _reply) => {
    const projects = app.projectRepo.listProjects();
    return { projects };
  });
}
