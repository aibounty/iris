import { readFileSync, existsSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import { randomBytes } from "node:crypto";

const ServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(4269),
});

const TerminalConfigSchema = z.object({
  preferred: z
    .enum(["auto", "iterm", "terminal_app", "kitty", "shell"])
    .default("auto"),
});

const IndexerConfigSchema = z.object({
  poll_interval_ms: z.number().int().min(1000).default(30_000),
  claude_data_dir: z.string().optional(),
});

const UiConfigSchema = z.object({
  open_browser: z.boolean().default(true),
});

const SecurityConfigSchema = z.object({
  auth_token: z.string().optional(),
  readonly: z.boolean().default(false),
});

const IrisConfigSchema = z.object({
  server: ServerConfigSchema.default({}),
  terminal: TerminalConfigSchema.default({}),
  indexer: IndexerConfigSchema.default({}),
  ui: UiConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
});

export type IrisConfig = z.infer<typeof IrisConfigSchema>;

export function getDefaultConfig(): IrisConfig {
  return IrisConfigSchema.parse({});
}

export function loadConfig(configPath?: string): IrisConfig {
  const home = process.env["HOME"] || process.env["USERPROFILE"] || "~";
  const path = configPath ?? `${home}/.config/iris/config.toml`;

  if (!existsSync(path)) {
    return getDefaultConfig();
  }

  try {
    const content = readFileSync(path, "utf-8");
    const raw = parseToml(content);
    return IrisConfigSchema.parse(raw);
  } catch {
    // If parsing fails, return defaults
    return getDefaultConfig();
  }
}

export function generateAuthToken(): string {
  return randomBytes(16).toString("hex");
}
