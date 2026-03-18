import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface StaticOptions {
  distPath: string;
}

export async function registerStaticRoutes(
  app: FastifyInstance,
  options: StaticOptions,
): Promise<void> {
  const { distPath } = options;

  if (!existsSync(distPath)) {
    app.log.warn(`Static dist path not found: ${distPath}`);
    return;
  }

  await app.register(fastifyStatic, {
    root: distPath,
    prefix: "/",
    decorateReply: false,
  });

  // Cache index.html content for SPA fallback
  const indexPath = join(distPath, "index.html");
  const indexHtml = existsSync(indexPath)
    ? readFileSync(indexPath, "utf-8")
    : null;

  // SPA fallback: serve index.html for non-API, non-file routes
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found" });
    }

    if (indexHtml) {
      return reply.type("text/html").send(indexHtml);
    }

    return reply.code(404).send({ error: "Not found" });
  });
}
