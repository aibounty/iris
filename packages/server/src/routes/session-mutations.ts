import type { FastifyInstance } from "fastify";
import { createAuthHook } from "../middleware/auth.js";
import { TerminalManager } from "@iris/core";
import type { TerminalPreference } from "@iris/core";

export async function registerSessionMutationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const authHook = createAuthHook({
    authToken: app.appOptions.authToken,
    readonly: app.appOptions.readonly,
  });

  // Update note
  app.post<{
    Params: { id: string };
    Body: { note: string };
  }>(
    "/sessions/:id/note",
    { preHandler: authHook },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return reply.code(400).send({ error: "Invalid session ID" });
      }

      const session = app.sessionRepo.findById(id);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      app.sessionRepo.updateNote(id, request.body.note);
      const updated = app.sessionRepo.findById(id)!;
      return { ok: true, session: updated };
    },
  );

  // Pin/unpin
  app.post<{
    Params: { id: string };
    Body: { pinned: boolean };
  }>(
    "/sessions/:id/pin",
    { preHandler: authHook },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return reply.code(400).send({ error: "Invalid session ID" });
      }

      const session = app.sessionRepo.findById(id);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      app.sessionRepo.updatePin(id, request.body.pinned);
      const updated = app.sessionRepo.findById(id)!;
      return { ok: true, session: updated };
    },
  );

  // Archive/unarchive
  app.post<{
    Params: { id: string };
    Body: { archived: boolean };
  }>(
    "/sessions/:id/archive",
    { preHandler: authHook },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return reply.code(400).send({ error: "Invalid session ID" });
      }

      const session = app.sessionRepo.findById(id);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      app.sessionRepo.updateArchive(id, request.body.archived);
      const updated = app.sessionRepo.findById(id)!;
      return { ok: true, session: updated };
    },
  );

  // Tags
  app.post<{
    Params: { id: string };
    Body: { add?: string[]; remove?: string[] };
  }>(
    "/sessions/:id/tags",
    { preHandler: authHook },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return reply.code(400).send({ error: "Invalid session ID" });
      }

      const session = app.sessionRepo.findById(id);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      const { add, remove } = request.body;
      if (add) {
        for (const tag of add) {
          app.sessionRepo.addTag(id, tag);
        }
      }
      if (remove) {
        for (const tag of remove) {
          app.sessionRepo.removeTag(id, tag);
        }
      }

      const updated = app.sessionRepo.findById(id)!;
      return { ok: true, session: updated };
    },
  );

  // Resume
  app.post<{
    Params: { id: string };
    Body: { terminal?: string };
  }>(
    "/sessions/:id/resume",
    { preHandler: authHook },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id) || id <= 0) {
        return reply.code(400).send({ error: "Invalid session ID" });
      }

      const session = app.sessionRepo.findById(id);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      const terminalPref =
        (request.body.terminal as TerminalPreference) || "auto";
      const manager = new TerminalManager(terminalPref);
      const result = await manager.resume(
        session.claude_session_id,
        session.project_path ?? undefined,
      );

      return {
        ok: true,
        claude_session_id: session.claude_session_id,
        terminal: result.terminal,
      };
    },
  );
}
