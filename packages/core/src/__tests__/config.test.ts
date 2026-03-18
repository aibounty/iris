import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, getDefaultConfig, generateAuthToken } from "../config.js";

describe("Config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `iris-config-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns defaults when config file does not exist", () => {
    const config = loadConfig(join(tempDir, "nonexistent.toml"));
    const defaults = getDefaultConfig();

    expect(config).toEqual(defaults);
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.server.port).toBe(4269);
    expect(config.terminal.preferred).toBe("auto");
    expect(config.indexer.poll_interval_ms).toBe(30_000);
    expect(config.ui.open_browser).toBe(true);
    expect(config.security.readonly).toBe(false);
  });

  it("loads valid TOML config", () => {
    const configPath = join(tempDir, "config.toml");
    writeFileSync(
      configPath,
      `
[server]
host = "0.0.0.0"
port = 8080

[terminal]
preferred = "iterm"

[security]
auth_token = "my-secret-token"
readonly = true
`,
    );

    const config = loadConfig(configPath);

    expect(config.server.host).toBe("0.0.0.0");
    expect(config.server.port).toBe(8080);
    expect(config.terminal.preferred).toBe("iterm");
    expect(config.security.auth_token).toBe("my-secret-token");
    expect(config.security.readonly).toBe(true);
    // Missing sections use defaults
    expect(config.indexer.poll_interval_ms).toBe(30_000);
    expect(config.ui.open_browser).toBe(true);
  });

  it("handles partial TOML (missing sections use defaults)", () => {
    const configPath = join(tempDir, "partial.toml");
    writeFileSync(
      configPath,
      `
[server]
port = 5555
`,
    );

    const config = loadConfig(configPath);

    expect(config.server.port).toBe(5555);
    expect(config.server.host).toBe("127.0.0.1"); // default
    expect(config.terminal.preferred).toBe("auto"); // default
    expect(config.security.readonly).toBe(false); // default
  });

  it("generateAuthToken returns valid 32-char hex string", () => {
    const token = generateAuthToken();

    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generateAuthToken returns unique values", () => {
    const token1 = generateAuthToken();
    const token2 = generateAuthToken();

    expect(token1).not.toBe(token2);
  });
});
