import type { FastifyInstance } from "fastify";

export async function registerProjectRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/projects", async (_request, _reply) => {
    const projects = app.projectRepo.listProjects();
    return { projects };
  });

  app.get<{
    Params: { id: string };
  }>("/projects/:id", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return reply.code(400).send({ error: "Invalid project ID" });
    }

    const project = app.projectRepo.findById(id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    return { project };
  });
}
