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
    await execa("claude", args, {
      cwd: projectPath || undefined,
      stdio: "inherit",
    });
  }
}

export class ItermAdapter implements TerminalAdapter {
  name = "iterm";

  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execaCommand(
        `osascript -e 'application "iTerm" is running'`,
      );
      return stdout.trim() === "true";
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
    try {
      const { stdout } = await execaCommand(
        `osascript -e 'application "Terminal" is running'`,
      );
      return stdout.trim() === "true";
    } catch {
      return false;
    }
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
