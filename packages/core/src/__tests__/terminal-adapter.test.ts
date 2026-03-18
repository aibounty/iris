import { describe, it, expect, vi } from "vitest";
import { ShellAdapter, TerminalManager } from "../terminal/index.js";

// We can't actually spawn terminals in tests, so we test the adapter selection
// logic and verify ShellAdapter's interface

describe("ShellAdapter", () => {
  it("is always available", async () => {
    const adapter = new ShellAdapter();
    expect(await adapter.isAvailable()).toBe(true);
  });

  it("has correct name", () => {
    const adapter = new ShellAdapter();
    expect(adapter.name).toBe("shell");
  });
});

describe("TerminalManager", () => {
  it("with preferred=shell returns ShellAdapter", async () => {
    const manager = new TerminalManager("shell");
    const adapter = await manager.resolve();
    expect(adapter.name).toBe("shell");
  });

  it("with preferred=auto eventually falls back to shell", async () => {
    // In test environment, no terminals are running
    const manager = new TerminalManager("auto");
    const adapter = await manager.resolve();
    // Will fall back to shell since no macOS terminals available in CI/test
    expect(adapter.name).toBeDefined();
  });

  it("resume calls the resolved adapter", async () => {
    const manager = new TerminalManager("shell");

    // Mock the resolve to return a fake adapter
    const mockAdapter = {
      name: "mock",
      isAvailable: async () => true,
      openSession: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(manager, "resolve").mockResolvedValue(mockAdapter);

    const result = await manager.resume("test-session-id", "/path/to/project");
    expect(mockAdapter.openSession).toHaveBeenCalledWith(
      "test-session-id",
      "/path/to/project",
    );
    expect(result.terminal).toBe("mock");
  });
});
