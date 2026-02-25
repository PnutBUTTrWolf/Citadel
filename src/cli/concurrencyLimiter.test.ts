import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConcurrencyLimiter } from "./concurrencyLimiter";
import type { CLICommandConfig } from "./concurrencyLimiter";

function makeConfig(
  command: string,
  args: string[] = [],
  opts: Partial<CLICommandConfig> = {},
): CLICommandConfig {
  return { command, args, ...opts };
}

/** Flush pending microtasks so .finally() handlers in processQueue settle. */
function flushMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("ConcurrencyLimiter", () => {
  describe("initial state", () => {
    it("starts with empty stats", () => {
      const limiter = new ConcurrencyLimiter();
      expect(limiter.getStats()).toEqual({
        queued: 0,
        active: 0,
        maxConcurrency: 4,
      });
    });

    it("respects custom maxConcurrency", () => {
      const limiter = new ConcurrencyLimiter(2);
      expect(limiter.getStats().maxConcurrency).toBe(2);
    });
  });

  describe("basic execution", () => {
    it("executes a single request", async () => {
      const limiter = new ConcurrencyLimiter();
      const executor = vi.fn().mockResolvedValue("result");

      const result = await limiter.execute(makeConfig("gt", ["status"]), executor);

      expect(result).toBe("result");
      expect(executor).toHaveBeenCalledOnce();
    });

    it("passes config to executor", async () => {
      const limiter = new ConcurrencyLimiter();
      const config = makeConfig("gt", ["status", "--json"]);
      const executor = vi.fn().mockResolvedValue("ok");

      await limiter.execute(config, executor);

      expect(executor).toHaveBeenCalledWith(config);
    });
  });

  describe("concurrency limiting", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("limits concurrent executions to maxConcurrency", async () => {
      const limiter = new ConcurrencyLimiter(2);
      let activeCount = 0;
      let peakActive = 0;

      const executor = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            activeCount++;
            peakActive = Math.max(peakActive, activeCount);
            setTimeout(() => {
              activeCount--;
              resolve("done");
            }, 100);
          }),
      );

      const promises = [
        limiter.execute(makeConfig("cmd", ["1"], { dedupe: false }), executor),
        limiter.execute(makeConfig("cmd", ["2"], { dedupe: false }), executor),
        limiter.execute(makeConfig("cmd", ["3"], { dedupe: false }), executor),
        limiter.execute(makeConfig("cmd", ["4"], { dedupe: false }), executor),
      ];

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      await Promise.all(promises);
      expect(peakActive).toBeLessThanOrEqual(2);
    });

    it("processes queued requests after active ones complete", async () => {
      const limiter = new ConcurrencyLimiter(1);
      const results: string[] = [];

      const executor = vi.fn().mockImplementation(
        (cfg: CLICommandConfig) =>
          new Promise<string>((resolve) => {
            const val = cfg.args[0];
            setTimeout(() => {
              results.push(val);
              resolve(val);
            }, 10);
          }),
      );

      const p1 = limiter.execute(makeConfig("cmd", ["first"], { dedupe: false }), executor);
      const p2 = limiter.execute(makeConfig("cmd", ["second"], { dedupe: false }), executor);

      await vi.advanceTimersByTimeAsync(10); // first completes
      await vi.advanceTimersByTimeAsync(10); // second completes

      await Promise.all([p1, p2]);
      expect(results).toEqual(["first", "second"]);
    });
  });

  describe("request deduplication", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("deduplicates identical in-flight requests by default", async () => {
      const limiter = new ConcurrencyLimiter();
      const executor = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve("shared"), 50);
          }),
      );

      const p1 = limiter.execute(makeConfig("gt", ["status"]), executor);
      const p2 = limiter.execute(makeConfig("gt", ["status"]), executor);

      await vi.advanceTimersByTimeAsync(50);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe("shared");
      expect(r2).toBe("shared");
      expect(executor).toHaveBeenCalledOnce(); // deduplicated
    });

    it("does not deduplicate when dedupe is false", async () => {
      const limiter = new ConcurrencyLimiter();
      const executor = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve("result"), 10);
          }),
      );

      const p1 = limiter.execute(
        makeConfig("gt", ["status"], { dedupe: false }),
        executor,
      );
      const p2 = limiter.execute(
        makeConfig("gt", ["status"], { dedupe: false }),
        executor,
      );

      await vi.advanceTimersByTimeAsync(10);

      await Promise.all([p1, p2]);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it("treats different args as different keys", async () => {
      const limiter = new ConcurrencyLimiter();
      const executor = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve("r"), 10);
          }),
      );

      const p1 = limiter.execute(makeConfig("gt", ["status"]), executor);
      const p2 = limiter.execute(makeConfig("gt", ["mail"]), executor);

      await vi.advanceTimersByTimeAsync(10);

      await Promise.all([p1, p2]);
      expect(executor).toHaveBeenCalledTimes(2);
    });
  });

  describe("clear()", () => {
    it("rejects all queued requests", async () => {
      const limiter = new ConcurrencyLimiter(1);
      const neverResolve = vi.fn().mockImplementation(
        () => new Promise<string>(() => {}), // never resolves
      );

      // Fill the active slot
      limiter.execute(makeConfig("cmd", ["1"], { dedupe: false }), neverResolve);

      // This one goes to queue
      const queued = limiter.execute(
        makeConfig("cmd", ["2"], { dedupe: false }),
        neverResolve,
      );

      limiter.clear();

      await expect(queued).rejects.toThrow("Queue cleared");
    });

    it("resets queue stats", () => {
      const limiter = new ConcurrencyLimiter();
      limiter.clear();
      expect(limiter.getStats().queued).toBe(0);
    });
  });

  describe("getStats()", () => {
    it("reflects active count during execution", async () => {
      const limiter = new ConcurrencyLimiter(4);
      let resolveExecutor!: () => void;
      const executor = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveExecutor = () => resolve("done");
          }),
      );

      const p = limiter.execute(makeConfig("gt", ["status"], { dedupe: false }), executor);
      expect(limiter.getStats().active).toBe(1);

      resolveExecutor();
      await p;
      // The .finally() handler in processQueue needs a microtask tick to run
      await flushMicrotasks();

      expect(limiter.getStats().active).toBe(0);
    });
  });
});
