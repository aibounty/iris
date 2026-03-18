import pino from "pino";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface LoggerOptions {
  level?: string;
  logFile?: string;
}

export function createLogger(options: LoggerOptions = {}): pino.Logger {
  const home = process.env["HOME"] || process.env["USERPROFILE"] || "~";
  const level = options.level ?? "info";
  const logFile = options.logFile ?? `${home}/.config/iris/logs/iris.log`;

  // Ensure log directory exists
  mkdirSync(dirname(logFile), { recursive: true });

  return pino(
    { level },
    pino.destination({ dest: logFile, sync: false }),
  );
}
