import type { Command } from "commander";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDb,
  runMigrations,
  SessionRepo,
  ProjectRepo,
  TagRepo,
  Indexer,
  loadConfig,
  generateAuthToken,
  createLogger,
} from "@iris/core";
import { createApp, registerStaticRoutes } from "@iris/server";

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start the Iris web server with API, UI, and indexer")
    .option("-p, --port <port>", "port to listen on")
    .option("--host <host>", "host to bind to")
    .option("--no-open", "don't open browser on start")
    .option("--readonly", "read-only mode (no mutations allowed)")
    .option("--log-level <level>", "log level (debug, info, warn, error)", "info")
    .option("--config <path>", "path to config file")
    .action(async (opts) => {
      const config = loadConfig(opts.config);

      // CLI flags override config
      const port = opts.port ? parseInt(opts.port, 10) : config.server.port;
      const host = opts.host ?? config.server.host;
      const readonly = opts.readonly ?? config.security.readonly;
      const logLevel = opts.logLevel ?? "info";

      // Set up logger
      const logger = createLogger({ level: logLevel });

      // Set up database
      const home = process.env["HOME"] || process.env["USERPROFILE"] || "~";
      const dbPath = `${home}/.config/iris/data.db`;
      mkdirSync(dirname(dbPath), { recursive: true });

      const db = createDb(dbPath);
      runMigrations(db);

      // Set up repos
      const sessionRepo = new SessionRepo(db);
      const projectRepo = new ProjectRepo(db);
      const tagRepo = new TagRepo(db);

      // Auth token
      let authToken = config.security.auth_token;
      if (!authToken) {
        authToken = generateAuthToken();
      }

      // Create Fastify app
      const app = await createApp({
        db,
        readonly,
        authToken,
      });

      // Serve static web UI files
      // Resolve the web dist directory relative to this package
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const webDistPath = resolve(thisDir, "../../../web/dist");
      await registerStaticRoutes(app, { distPath: webDistPath });

      // Set up indexer
      const claudeDataDir = config.indexer.claude_data_dir ?? `${home}/.claude`;
      const indexer = new Indexer(db, { claudeDataDir });

      // Run initial scan
      const scanResult = indexer.scan();
      logger.info(
        { scanResult },
        `Initial scan: ${scanResult.total} sessions (${scanResult.newSessions} new)`,
      );

      // Start polling
      indexer.startPolling(config.indexer.poll_interval_ms);

      // Start server
      try {
        await app.listen({ port, host });
      } catch (err) {
        console.error(`Failed to start server: ${err}`);
        process.exit(1);
      }

      const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;

      console.log("");
      console.log("  Iris is running");
      console.log("");
      console.log(`  URL:        ${url}`);
      console.log(`  Auth Token: ${authToken}`);
      console.log(`  Sessions:   ${sessionRepo.count()}`);
      console.log(`  Mode:       ${readonly ? "read-only" : "read-write"}`);
      console.log("");

      // Open browser
      if (opts.open !== false && config.ui.open_browser) {
        try {
          const { exec } = await import("node:child_process");
          if (process.platform === "darwin") {
            exec(`open ${url}`);
          } else if (process.platform === "linux") {
            exec(`xdg-open ${url}`);
          }
        } catch {
          // Ignore browser open failures
        }
      }

      // Graceful shutdown
      function shutdown() {
        console.log("\nShutting down...");
        indexer.stopPolling();
        app.close().then(() => {
          db.close();
          process.exit(0);
        });
      }

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
}
