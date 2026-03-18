import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { SessionRepo, ProjectRepo, TagRepo } from "@iris/core";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerTagRoutes } from "./routes/tags.js";
import { registerSessionMutationRoutes } from "./routes/session-mutations.js";

export interface AppOptions {
  db: Database.Database;
  readonly?: boolean;
  authToken?: string;
}

declare module "fastify" {
  interface FastifyInstance {
    sessionRepo: SessionRepo;
    projectRepo: ProjectRepo;
    tagRepo: TagRepo;
    appOptions: AppOptions;
  }
}

export async function createApp(
  options: AppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    ],
  });

  // Decorate with repos
  const sessionRepo = new SessionRepo(options.db);
  const projectRepo = new ProjectRepo(options.db);
  const tagRepo = new TagRepo(options.db);

  app.decorate("sessionRepo", sessionRepo);
  app.decorate("projectRepo", projectRepo);
  app.decorate("tagRepo", tagRepo);
  app.decorate("appOptions", options);

  // Register routes
  await app.register(registerHealthRoutes, { prefix: "/api" });
  await app.register(registerSessionRoutes, { prefix: "/api" });
  await app.register(registerProjectRoutes, { prefix: "/api" });
  await app.register(registerTagRoutes, { prefix: "/api" });
  await app.register(registerSessionMutationRoutes, { prefix: "/api" });

  return app;
}
