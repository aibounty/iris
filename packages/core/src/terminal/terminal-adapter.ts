import { execaCommand, execa } from "execa";

export interface TerminalAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  openSession(
    claudeSessionId: string,
    projectPath?: string,
  ): Promise<void>;
}

export class ShellAdapter implements TerminalAdapter {
  name = "shell";

  async isAvailable(): Promise<boolean> {
    return true; // Always available as fallback
  }

  async openSession(
    claudeSessionId: string,
    projectPath?: string,
  ): Promise<void> {
    const args = ["--resume", claudeSessionId];

    if (process.platform === "darwin") {
      // On macOS, open a new Terminal.app window rather than hijacking current shell
      const cdCmd = projectPath
        ? `cd ${escapeShell(projectPath)} && `
        : "";
      const fullCmd = `${cdCmd}claude --resume ${escapeShell(claudeSessionId)}`;
      const script = `
        tell application "Terminal"
          activate
          do script "${escapeAppleScript(fullCmd)}"
        end tell
      `;
      await execa("osascript", ["-e", script]);
    } else if (process.platform === "linux") {
      // Try common Linux terminal emulators
      try {
        await execa("x-terminal-emulator", ["-e", "claude", ...args], {
          cwd: projectPath || undefined,
          detached: true,
          stdio: "ignore",
        });
      } catch {
        // Last resort: run in current shell
        await execa("claude", args, {
          cwd: projectPath || undefined,
          stdio: "inherit",
        });
      }
    } else {
      // Windows or other: run in current shell
      await execa("claude", args, {
        cwd: projectPath || undefined,
        stdio: "inherit",
      });
    }
  }
}

export class ItermAdapter implements TerminalAdapter {
  name = "iterm";

  async isAvailable(): Promise<boolean> {
    try {
      // Check if iTerm exists on the system, not just if it's running
      const { stdout } = await execaCommand(
        `osascript -e 'id of application "iTerm2"'`,
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async openSession(
    claudeSessionId: string,
    projectPath?: string,
  ): Promise<void> {
    const cdPart = projectPath
      ? `write text "cd ${escapeAppleScript(projectPath)}"`
      : "";
    const script = `
      tell application "iTerm"
        activate
        tell current window
          create tab with default profile
          tell current session
            ${cdPart}
            write text "claude --resume ${escapeAppleScript(claudeSessionId)}"
          end tell
        end tell
      end tell
    `;
    await execa("osascript", ["-e", script]);
  }
}

export class TerminalAppAdapter implements TerminalAdapter {
  name = "terminal_app";

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    // Terminal.app is always installed on macOS
    return true;
  }

  async openSession(
    claudeSessionId: string,
    projectPath?: string,
  ): Promise<void> {
    const cdCmd = projectPath
      ? `cd ${escapeShell(projectPath)} && `
      : "";
    const fullCmd = `${cdCmd}claude --resume ${escapeShell(claudeSessionId)}`;
    const script = `
      tell application "Terminal"
        activate
        do script "${escapeAppleScript(fullCmd)}"
      end tell
    `;
    await execa("osascript", ["-e", script]);
  }
}

export class KittyAdapter implements TerminalAdapter {
  name = "kitty";

  async isAvailable(): Promise<boolean> {
    try {
      await execa("kitty", ["@", "ls"]);
      return true;
    } catch {
      return false;
    }
  }

  async openSession(
    claudeSessionId: string,
    projectPath?: string,
  ): Promise<void> {
    const args = [
      "@",
      "launch",
      "--type=tab",
      "--cwd",
      projectPath || process.cwd(),
      "claude",
      "--resume",
      claudeSessionId,
    ];
    await execa("kitty", args);
  }
}

function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeShell(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}
