import type { Command } from "commander";
import { existsSync } from "node:fs";
import { loadConfig } from "@iris/core";

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description("Show current Iris configuration")
    .option("--path <path>", "path to config file")
    .action((opts) => {
      const home = process.env["HOME"] || process.env["USERPROFILE"] || "~";
      const configPath = opts.path ?? `${home}/.config/iris/config.toml`;

      if (!existsSync(configPath)) {
        console.log(`Config file not found at: ${configPath}`);
        console.log("Using defaults:\n");
      } else {
        console.log(`Config loaded from: ${configPath}\n`);
      }

      const config = loadConfig(opts.path);
      console.log(JSON.stringify(config, null, 2));
    });
}
