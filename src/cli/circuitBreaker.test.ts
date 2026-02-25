import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker } from "./circuitBreaker";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("starts in CLOSED state", () => {
      const cb = new CircuitBreaker();
      expect(cb.getState()).toBe("CLOSED");
    });

    it("allows execution when CLOSED", () => {
      const cb = new CircuitBreaker();
      expect(cb.canExecute()).toBe(true);
    });

    it("reports initial stats", () => {
      const cb = new CircuitBreaker();
      expect(cb.getStats()).toEqual({
        state: "CLOSED",
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
      });
    });
  });

  describe("CLOSED -> OPEN transition", () => {
    it("stays CLOSED below failure threshold", () => {
      const cb = new CircuitBreaker(3, 1000);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe("CLOSED");
      expect(cb.canExecute()).toBe(true);
    });

    it("transitions to OPEN at failure threshold", () => {
      const cb = new CircuitBreaker(3, 1000);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
      expect(cb.canExecute()).toBe(false);
    });

    it("transitions to OPEN when exceeding threshold", () => {
      const cb = new CircuitBreaker(2, 1000);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
    });

    it("uses default threshold of 5", () => {
      const cb = new CircuitBreaker();
      for (let i = 0; i < 4; i++) {
        cb.recordFailure();
      }
      expect(cb.getState()).toBe("CLOSED");
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
    });
  });

  describe("failure count reset on success", () => {
    it("resets failure count on success in CLOSED state", () => {
      const cb = new CircuitBreaker(3, 1000);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess(); // resets count
      cb.recordFailure();
      cb.recordFailure();
      // Would be 4 total without reset, but count was reset
      expect(cb.getState()).toBe("CLOSED");
    });
  });

  describe("OPEN state behavior", () => {
    it("blocks execution when OPEN", () => {
      const cb = new CircuitBreaker(1, 60_000);
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
      expect(cb.canExecute()).toBe(false);
    });

    it("stays OPEN before reset time elapses", () => {
      const cb = new CircuitBreaker(1, 10_000);
      vi.setSystemTime(1000);
      cb.recordFailure();
      vi.setSystemTime(5000); // 4s later, reset is 10s
      expect(cb.canExecute()).toBe(false);
      expect(cb.getState()).toBe("OPEN");
    });
  });

  describe("OPEN -> HALF_OPEN transition", () => {
    it("transitions to HALF_OPEN after reset time", () => {
      const cb = new CircuitBreaker(1, 5000);
      vi.setSystemTime(1000);
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");

      vi.setSystemTime(6000); // 5s later = resetTimeMs
      expect(cb.canExecute()).toBe(true);
      expect(cb.getState()).toBe("HALF_OPEN");
    });

    it("resets successCount when entering HALF_OPEN", () => {
      const cb = new CircuitBreaker(1, 5000);
      vi.setSystemTime(1000);
      cb.recordFailure();

      vi.setSystemTime(6000);
      cb.canExecute(); // triggers HALF_OPEN
      expect(cb.getStats().successCount).toBe(0);
    });
  });

  describe("HALF_OPEN state behavior", () => {
    it("allows execution in HALF_OPEN", () => {
      const cb = new CircuitBreaker(1, 5000);
      vi.setSystemTime(1000);
      cb.recordFailure();
      vi.setSystemTime(6000);
      expect(cb.canExecute()).toBe(true); // enters HALF_OPEN
      expect(cb.canExecute()).toBe(true); // stays HALF_OPEN, still allows
    });

    it("transitions to CLOSED after 2 successes in HALF_OPEN", () => {
      const cb = new CircuitBreaker(1, 5000);
      vi.setSystemTime(1000);
      cb.recordFailure();
      vi.setSystemTime(6000);
      cb.canExecute(); // enters HALF_OPEN

      cb.recordSuccess();
      expect(cb.getState()).toBe("HALF_OPEN");
      cb.recordSuccess();
      expect(cb.getState()).toBe("CLOSED");
    });

    it("transitions back to OPEN on any failure in HALF_OPEN", () => {
      const cb = new CircuitBreaker(1, 5000);
      vi.setSystemTime(1000);
      cb.recordFailure();
      vi.setSystemTime(6000);
      cb.canExecute(); // enters HALF_OPEN

      cb.recordSuccess(); // 1 success
      cb.recordFailure(); // failure re-opens
      expect(cb.getState()).toBe("OPEN");
    });

    it("re-opens on failure even with no prior successes in HALF_OPEN", () => {
      const cb = new CircuitBreaker(1, 5000);
      vi.setSystemTime(1000);
      cb.recordFailure();
      vi.setSystemTime(6000);
      cb.canExecute(); // enters HALF_OPEN

      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");
    });
  });

  describe("reset()", () => {
    it("resets to initial CLOSED state", () => {
      const cb = new CircuitBreaker(1, 5000);
      cb.recordFailure(); // OPEN
      cb.reset();
      expect(cb.getState()).toBe("CLOSED");
      expect(cb.getStats()).toEqual({
        state: "CLOSED",
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
      });
    });

    it("allows execution after reset from OPEN", () => {
      const cb = new CircuitBreaker(1, 5000);
      cb.recordFailure();
      expect(cb.canExecute()).toBe(false);
      cb.reset();
      expect(cb.canExecute()).toBe(true);
    });
  });

  describe("getStats()", () => {
    it("tracks failure count", () => {
      const cb = new CircuitBreaker(5, 1000);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getStats().failureCount).toBe(2);
    });

    it("tracks lastFailureTime", () => {
      const cb = new CircuitBreaker(5, 1000);
      vi.setSystemTime(42000);
      cb.recordFailure();
      expect(cb.getStats().lastFailureTime).toBe(42000);
    });

    it("tracks successCount in HALF_OPEN", () => {
      const cb = new CircuitBreaker(1, 5000);
      vi.setSystemTime(1000);
      cb.recordFailure();
      vi.setSystemTime(6000);
      cb.canExecute(); // HALF_OPEN
      cb.recordSuccess();
      expect(cb.getStats().successCount).toBe(1);
    });
  });

  describe("full cycle", () => {
    it("goes CLOSED -> OPEN -> HALF_OPEN -> CLOSED", () => {
      const cb = new CircuitBreaker(2, 10_000);

      // CLOSED: failures accumulate
      vi.setSystemTime(0);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");

      // OPEN: wait for reset
      vi.setSystemTime(10_000);
      expect(cb.canExecute()).toBe(true);
      expect(cb.getState()).toBe("HALF_OPEN");

      // HALF_OPEN: 2 successes close
      cb.recordSuccess();
      cb.recordSuccess();
      expect(cb.getState()).toBe("CLOSED");
      expect(cb.canExecute()).toBe(true);
    });

    it("goes CLOSED -> OPEN -> HALF_OPEN -> OPEN (failure during recovery)", () => {
      const cb = new CircuitBreaker(2, 10_000);

      vi.setSystemTime(0);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe("OPEN");

      vi.setSystemTime(10_000);
      cb.canExecute(); // HALF_OPEN
      cb.recordSuccess();
      cb.recordFailure(); // back to OPEN
      expect(cb.getState()).toBe("OPEN");
    });
  });
});
