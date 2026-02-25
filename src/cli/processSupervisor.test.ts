import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vscode (transitive dependency via constants.ts)
vi.mock("vscode", () => {
  class ThemeColor {
    constructor(public id: string) {}
  }
  return { ThemeColor };
});

// Mock child_process.execFile
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

// Mock env utilities
vi.mock("./env", () => ({
  getEnvWithPath: vi.fn().mockReturnValue({ PATH: "/usr/bin" }),
  resolveCommand: vi.fn().mockImplementation((cmd: string) => cmd),
}));

import { ProcessSupervisor, type CLIResult } from "./processSupervisor";
import { execFile } from "child_process";
import type { CLICommandConfig } from "./concurrencyLimiter";

const mockExecFile = vi.mocked(execFile);

function makeConfig(
  command = "gt",
  args: string[] = ["status"],
  opts: Partial<CLICommandConfig> = {},
): CLICommandConfig {
  return { command, args, ...opts };
}

/**
 * Simulate a successful execFile callback.
 * The mock captures the callback from the last execFile call and invokes it.
 */
function simulateExecFileSuccess(stdout: string, stderr = ""): void {
  const call = mockExecFile.mock.calls[mockExecFile.mock.calls.length - 1];
  const callback = call[3] as Function;
  callback(null, stdout, stderr);
}

/**
 * Simulate an execFile error callback.
 */
function simulateExecFileError(
  message: string,
  opts: { killed?: boolean; code?: number; stderr?: string } = {},
): void {
  const call = mockExecFile.mock.calls[mockExecFile.mock.calls.length - 1];
  const callback = call[3] as Function;
  const error: any = new Error(message);
  if (opts.killed !== undefined) {
    error.killed = opts.killed;
  }
  if (opts.code !== undefined) {
    error.code = opts.code;
  }
  callback(error, "", opts.stderr || "");
}

describe("ProcessSupervisor", () => {
  let supervisor: ProcessSupervisor;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock execFile to return a fake child process with an 'on' method
    mockExecFile.mockImplementation((...args: any[]) => {
      const child = {
        on: vi.fn(),
        kill: vi.fn(),
        pid: 12345,
      };
      return child as any;
    });
  });

  afterEach(() => {
    if (supervisor && !supervisor.isDestroyed()) {
      supervisor.destroy();
    }
  });

  describe("constructor", () => {
    it("creates with default config", () => {
      supervisor = new ProcessSupervisor();
      const stats = supervisor.getStats();
      expect(stats.processes.active).toBe(0);
      expect(stats.processes.totalSpawned).toBe(0);
    });

    it("accepts custom config overrides", () => {
      supervisor = new ProcessSupervisor({
        maxConcurrency: 2,
        circuitBreakerThreshold: 3,
      });
      expect(supervisor.getStats().queue.maxConcurrency).toBe(2);
    });
  });

  describe("execute() guard checks", () => {
    it("returns failure when destroyed", async () => {
      supervisor = new ProcessSupervisor();
      supervisor.destroy();

      const result = await supervisor.execute(makeConfig());
      expect(result.success).toBe(false);
      expect(result.error).toBe("Process supervisor has been destroyed");
      expect(result.exitCode).toBe(-1);
      expect(result.duration).toBe(0);
    });

    it("returns failure when circuit breaker is open", async () => {
      supervisor = new ProcessSupervisor({ circuitBreakerThreshold: 1 });

      // Trip the circuit breaker by recording a failure
      supervisor.circuitBreaker.recordFailure();
      expect(supervisor.circuitBreaker.canExecute()).toBe(false);

      const result = await supervisor.execute(makeConfig());
      expect(result.success).toBe(false);
      expect(result.error).toBe("Circuit breaker is open — CLI is unavailable");
    });

    it("includes formatted command in failure results", async () => {
      supervisor = new ProcessSupervisor();
      supervisor.destroy();

      const result = await supervisor.execute(makeConfig("gt", ["status", "--json"]));
      expect(result.command).toBe("gt status --json");
    });
  });

  describe("executeCommand() via execute()", () => {
    it("resolves with parsed JSON data on success", async () => {
      supervisor = new ProcessSupervisor();

      const promise = supervisor.execute<{ status: string }>(
        makeConfig("gt", ["status", "--json"], { dedupe: false }),
      );

      // Wait a tick for execFile to be called
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess(JSON.stringify({ status: "ok" }));

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ status: "ok" });
      expect(result.error).toBeNull();
      expect(result.exitCode).toBe(0);
    });

    it("falls back to raw string when JSON parse fails", async () => {
      supervisor = new ProcessSupervisor();

      const promise = supervisor.execute<string>(
        makeConfig("gt", ["status"], { dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess("not valid json");

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.data).toBe("not valid json");
    });

    it("records circuit breaker success on successful execution", async () => {
      supervisor = new ProcessSupervisor();
      const recordSuccess = vi.spyOn(supervisor.circuitBreaker, "recordSuccess");

      const promise = supervisor.execute(
        makeConfig("gt", ["status"], { dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess("{}");

      await promise;
      expect(recordSuccess).toHaveBeenCalledOnce();
    });

    it("records circuit breaker failure on error", async () => {
      supervisor = new ProcessSupervisor();
      const recordFailure = vi.spyOn(supervisor.circuitBreaker, "recordFailure");

      const promise = supervisor.execute(
        makeConfig("gt", ["status"], { dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileError("command failed", { stderr: "some error" });

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe("some error");
      expect(recordFailure).toHaveBeenCalledOnce();
    });

    it("detects killed process", async () => {
      supervisor = new ProcessSupervisor();

      const promise = supervisor.execute(
        makeConfig("gt", ["status"], { dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileError("Process killed", { killed: true });

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe("Process was killed");
    });

    it("detects timeout via ETIMEDOUT", async () => {
      supervisor = new ProcessSupervisor();

      const promise = supervisor.execute(
        makeConfig("gt", ["status"], { timeout: 5000, dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileError("connect ETIMEDOUT");

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });

    it("uses stderr for error message when available", async () => {
      supervisor = new ProcessSupervisor();

      const promise = supervisor.execute(
        makeConfig("gt", ["fail"], { dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileError("generic error", { stderr: "detailed stderr output" });

      const result = await promise;
      expect(result.error).toBe("detailed stderr output");
    });

    it("falls back to error.message when no stderr", async () => {
      supervisor = new ProcessSupervisor();

      const promise = supervisor.execute(
        makeConfig("gt", ["fail"], { dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileError("the error message");

      const result = await promise;
      expect(result.error).toBe("the error message");
    });

    it("handles spawn error event", async () => {
      // Override mock to trigger the 'error' event handler
      mockExecFile.mockImplementation((...args: any[]) => {
        const handlers: Record<string, Function> = {};
        const child = {
          on: vi.fn().mockImplementation((event: string, handler: Function) => {
            handlers[event] = handler;
            // Trigger error immediately after registration
            if (event === "error") {
              setTimeout(() => handler(new Error("ENOENT: gt not found")), 0);
            }
          }),
          kill: vi.fn(),
          pid: undefined,
        };
        return child as any;
      });

      supervisor = new ProcessSupervisor();
      const recordFailure = vi.spyOn(supervisor.circuitBreaker, "recordFailure");

      const result = await supervisor.execute(
        makeConfig("gt", ["status"], { dedupe: false }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to spawn process");
      expect(recordFailure).toHaveBeenCalled();
    });

    it("passes correct options to execFile", async () => {
      supervisor = new ProcessSupervisor({ defaultTimeout: 15000 });

      const promise = supervisor.execute(
        makeConfig("gt", ["status", "--json"], { cwd: "/home/user/gt", dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));

      // Check execFile was called with correct args
      expect(mockExecFile).toHaveBeenCalled();
      const callArgs = mockExecFile.mock.calls[0];
      expect(callArgs[0]).toBe("gt"); // resolveCommand passes through
      expect(callArgs[1]).toEqual(["status", "--json"]);
      const options = callArgs[2] as any;
      expect(options.timeout).toBe(15000);
      expect(options.maxBuffer).toBe(10 * 1024 * 1024);
      expect(options.cwd).toBe("/home/user/gt");
      expect(options.env.GT_OUTPUT).toBe("json");

      simulateExecFileSuccess("{}");
      await promise;
    });

    it("uses config timeout over default", async () => {
      supervisor = new ProcessSupervisor({ defaultTimeout: 30000 });

      const promise = supervisor.execute(
        makeConfig("gt", ["status"], { timeout: 5000, dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));

      const options = mockExecFile.mock.calls[0][2] as any;
      expect(options.timeout).toBe(5000);

      simulateExecFileSuccess("{}");
      await promise;
    });

    it("tracks total spawned count", async () => {
      supervisor = new ProcessSupervisor();

      const p1 = supervisor.execute(makeConfig("gt", ["cmd1"], { dedupe: false }));
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess("{}");
      await p1;

      const p2 = supervisor.execute(makeConfig("gt", ["cmd2"], { dedupe: false }));
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess("{}");
      await p2;

      expect(supervisor.getStats().processes.totalSpawned).toBe(2);
    });
  });

  describe("destroy()", () => {
    it("marks supervisor as destroyed", () => {
      supervisor = new ProcessSupervisor();
      expect(supervisor.isDestroyed()).toBe(false);
      supervisor.destroy();
      expect(supervisor.isDestroyed()).toBe(true);
    });

    it("rejects subsequent execute calls after destroy", async () => {
      supervisor = new ProcessSupervisor();
      supervisor.destroy();

      const result = await supervisor.execute(makeConfig());
      expect(result.success).toBe(false);
      expect(result.error).toContain("destroyed");
    });
  });

  describe("getStats()", () => {
    it("aggregates queue, circuit breaker, and process stats", () => {
      supervisor = new ProcessSupervisor();
      const stats = supervisor.getStats();

      expect(stats).toHaveProperty("queue");
      expect(stats).toHaveProperty("circuitBreaker");
      expect(stats).toHaveProperty("processes");
      expect(stats.queue).toHaveProperty("queued");
      expect(stats.queue).toHaveProperty("active");
      expect(stats.queue).toHaveProperty("maxConcurrency");
      expect(stats.circuitBreaker).toHaveProperty("state");
      expect(stats.processes).toHaveProperty("active");
      expect(stats.processes).toHaveProperty("totalSpawned");
    });
  });

  describe("resetCircuitBreaker()", () => {
    it("resets the circuit breaker to initial state", () => {
      supervisor = new ProcessSupervisor({ circuitBreakerThreshold: 1 });
      supervisor.circuitBreaker.recordFailure();
      expect(supervisor.circuitBreaker.canExecute()).toBe(false);

      supervisor.resetCircuitBreaker();
      expect(supervisor.circuitBreaker.canExecute()).toBe(true);
      expect(supervisor.circuitBreaker.getState()).toBe("CLOSED");
    });
  });

  describe("convenience methods", () => {
    it("gt() creates command config with 'gt' command", async () => {
      supervisor = new ProcessSupervisor();
      const spy = vi.spyOn(supervisor, "execute");

      const promise = supervisor.gt(["status", "--json"]);
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess("{}");
      await promise;

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ command: "gt", args: ["status", "--json"] }),
      );
    });

    it("bd() creates command config with 'bd' command", async () => {
      supervisor = new ProcessSupervisor();
      const spy = vi.spyOn(supervisor, "execute");

      const promise = supervisor.bd(["list", "--json"]);
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess("[]");
      await promise;

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ command: "bd", args: ["list", "--json"] }),
      );
    });

    it("gt() merges additional options", async () => {
      supervisor = new ProcessSupervisor();
      const spy = vi.spyOn(supervisor, "execute");

      const promise = supervisor.gt(["status"], { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess("{}");
      await promise;

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ command: "gt", args: ["status"], timeout: 5000 }),
      );
    });
  });

  describe("circuit breaker integration", () => {
    it("blocks execution after threshold failures", async () => {
      supervisor = new ProcessSupervisor({ circuitBreakerThreshold: 2 });

      // Two failures to trip the breaker
      const p1 = supervisor.execute(makeConfig("gt", ["cmd1"], { dedupe: false }));
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileError("fail1");
      await p1;

      const p2 = supervisor.execute(makeConfig("gt", ["cmd2"], { dedupe: false }));
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileError("fail2");
      await p2;

      // Breaker should be OPEN
      expect(supervisor.circuitBreaker.getState()).toBe("OPEN");

      // Third call should be blocked by circuit breaker
      const p3 = await supervisor.execute(makeConfig("gt", ["cmd3"], { dedupe: false }));
      expect(p3.success).toBe(false);
      expect(p3.error).toContain("Circuit breaker is open");
      // execFile should NOT have been called for the third request
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    it("recovers after circuit breaker reset", async () => {
      supervisor = new ProcessSupervisor({ circuitBreakerThreshold: 1 });

      // Trip the breaker
      const p1 = supervisor.execute(makeConfig("gt", ["fail"], { dedupe: false }));
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileError("fail");
      await p1;

      // Reset
      supervisor.resetCircuitBreaker();

      // Should work again
      const p2 = supervisor.execute(makeConfig("gt", ["ok"], { dedupe: false }));
      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess('{"ok": true}');
      const result = await p2;

      expect(result.success).toBe(true);
    });
  });

  describe("concurrency limiter integration", () => {
    it("respects maxConcurrency setting", () => {
      supervisor = new ProcessSupervisor({ maxConcurrency: 3 });
      expect(supervisor.getStats().queue.maxConcurrency).toBe(3);
    });

    it("delegates execution through the limiter", async () => {
      supervisor = new ProcessSupervisor({ maxConcurrency: 4 });

      const promise = supervisor.execute(
        makeConfig("gt", ["status"], { dedupe: false }),
      );

      await new Promise((r) => setTimeout(r, 0));
      simulateExecFileSuccess("{}");

      const result = await promise;
      expect(result.success).toBe(true);
      // Verify it went through the full pipeline
      expect(supervisor.getStats().processes.totalSpawned).toBe(1);
    });
  });
});
