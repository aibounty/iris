import type { FastifyInstance } from "fastify";
import type { SessionFilter } from "@iris/core";

export async function registerSessionRoutes(
  app: FastifyInstance,
): Promise<void> {
  // List sessions
  app.get<{
    Querystring: {
      q?: string;
      repo?: string;
      branch?: string;
      tag?: string;
      pinned?: string;
      archived?: string;
      sidechains?: string;
      limit?: string;
      offset?: string;
      sort?: string;
    };
  }>("/sessions", async (request, _reply) => {
    const query = request.query;

    const filter: SessionFilter = {
      q: query.q || undefined,
      repo: query.repo || undefined,
      branch: query.branch || undefined,
      tag: query.tag || undefined,
      pinned: query.pinned === "true" ? true : undefined,
      archived: query.archived === "true" ? true : undefined,
      sidechains: query.sidechains === "true" ? true : undefined,
      limit: query.limit ? Math.min(parseInt(query.limit, 10), 200) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
      sort: (query.sort as SessionFilter["sort"]) || "modified",
    };

    const result = app.sessionRepo.list(filter);

    return {
      sessions: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  });

  // Get session by ID
  app.get<{
    Params: { id: string };
  }>("/sessions/:id", async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return reply.code(400).send({ error: "Invalid session ID" });
    }

    const session = app.sessionRepo.findById(id);
    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    return { session };
  });
}
