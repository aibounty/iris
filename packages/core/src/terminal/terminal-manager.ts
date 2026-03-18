import {
  ShellAdapter,
  ItermAdapter,
  TerminalAppAdapter,
  KittyAdapter,
} from "./terminal-adapter.js";
import type { TerminalAdapter } from "./terminal-adapter.js";

export type TerminalPreference =
  | "auto"
  | "iterm"
  | "terminal_app"
  | "kitty"
  | "shell";

export class TerminalManager {
  private preferred: TerminalPreference;

  constructor(preferred: TerminalPreference = "auto") {
    this.preferred = preferred;
  }

  async resolve(): Promise<TerminalAdapter> {
    if (this.preferred !== "auto") {
      const adapter = this.getAdapterByName(this.preferred);
      if (adapter && (await adapter.isAvailable())) {
        return adapter;
      }
      // Fall back to shell
      return new ShellAdapter();
    }

    // Auto: try in order
    const candidates: TerminalAdapter[] = [
      new ItermAdapter(),
      new TerminalAppAdapter(),
      new KittyAdapter(),
      new ShellAdapter(),
    ];

    for (const adapter of candidates) {
      if (await adapter.isAvailable()) {
        return adapter;
      }
    }

    return new ShellAdapter();
  }

  async resume(
    claudeSessionId: string,
    projectPath?: string,
  ): Promise<{ terminal: string }> {
    const adapter = await this.resolve();
    await adapter.openSession(claudeSessionId, projectPath);
    return { terminal: adapter.name };
  }

  private getAdapterByName(
    name: TerminalPreference,
  ): TerminalAdapter | null {
    switch (name) {
      case "iterm":
        return new ItermAdapter();
      case "terminal_app":
        return new TerminalAppAdapter();
      case "kitty":
        return new KittyAdapter();
      case "shell":
        return new ShellAdapter();
      default:
        return null;
    }
  }
}
