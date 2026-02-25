import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SWRCache } from "./swrCache";

describe("SWRCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("cache miss", () => {
    it("calls fetcher on first access", async () => {
      const cache = new SWRCache();
      const fetcher = vi.fn().mockResolvedValue("data");

      const result = await cache.get("key", 5000, fetcher);

      expect(result).toBe("data");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("returns fetcher result for unknown key", async () => {
      const cache = new SWRCache();
      const result = await cache.get("missing", 1000, async () => 42);
      expect(result).toBe(42);
    });
  });

  describe("cache hit (within TTL)", () => {
    it("returns cached data without calling fetcher again", async () => {
      const cache = new SWRCache();
      const fetcher = vi.fn().mockResolvedValue("fresh");

      await cache.get("key", 5000, fetcher);
      vi.setSystemTime(Date.now() + 3000); // within 5s TTL
      const result = await cache.get("key", 5000, fetcher);

      expect(result).toBe("fresh");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("caches different keys independently", async () => {
      const cache = new SWRCache();
      await cache.get("a", 5000, async () => "alpha");
      await cache.get("b", 5000, async () => "beta");

      vi.setSystemTime(Date.now() + 1000);
      const a = await cache.get("a", 5000, async () => "stale");
      const b = await cache.get("b", 5000, async () => "stale");

      expect(a).toBe("alpha");
      expect(b).toBe("beta");
    });
  });

  describe("stale-while-revalidate", () => {
    it("returns stale data when TTL expired", async () => {
      const cache = new SWRCache();
      vi.setSystemTime(1000);
      await cache.get("key", 5000, async () => "old");

      vi.setSystemTime(7000); // past TTL
      const result = await cache.get("key", 5000, async () => "new");

      expect(result).toBe("old"); // stale data returned immediately
    });

    it("triggers background revalidation on stale read", async () => {
      const cache = new SWRCache();
      const fetcher = vi.fn().mockResolvedValue("updated");

      vi.setSystemTime(1000);
      await cache.get("key", 5000, async () => "original");

      vi.setSystemTime(7000);
      await cache.get("key", 5000, fetcher); // triggers background revalidation

      // Let the pending revalidation resolve
      await vi.runAllTimersAsync();
      await Promise.resolve(); // flush microtasks

      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("serves updated data after revalidation completes", async () => {
      const cache = new SWRCache();
      vi.setSystemTime(1000);
      await cache.get("key", 5000, async () => "v1");

      vi.setSystemTime(7000);
      // stale read + background revalidation
      await cache.get("key", 5000, async () => "v2");
      await vi.runAllTimersAsync();
      await Promise.resolve();

      // Now within new TTL, should get v2
      vi.setSystemTime(8000);
      const result = await cache.get("key", 5000, async () => "v3");
      expect(result).toBe("v2");
    });

    it("deduplicates concurrent revalidations", async () => {
      const cache = new SWRCache();
      const fetcher = vi.fn().mockResolvedValue("refreshed");

      vi.setSystemTime(1000);
      await cache.get("key", 5000, async () => "initial");

      vi.setSystemTime(7000);
      // Two stale reads - should only trigger one revalidation
      await cache.get("key", 5000, fetcher);
      await cache.get("key", 5000, fetcher);

      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(fetcher).toHaveBeenCalledOnce();
    });
  });

  describe("clear()", () => {
    it("removes all entries", async () => {
      const cache = new SWRCache();
      await cache.get("a", 5000, async () => "alpha");
      await cache.get("b", 5000, async () => "beta");

      cache.clear();

      const fetcherA = vi.fn().mockResolvedValue("new-alpha");
      const fetcherB = vi.fn().mockResolvedValue("new-beta");

      await cache.get("a", 5000, fetcherA);
      await cache.get("b", 5000, fetcherB);

      expect(fetcherA).toHaveBeenCalledOnce();
      expect(fetcherB).toHaveBeenCalledOnce();
    });
  });

  describe("invalidate()", () => {
    it("removes a single entry", async () => {
      const cache = new SWRCache();
      await cache.get("a", 5000, async () => "alpha");
      await cache.get("b", 5000, async () => "beta");

      cache.invalidate("a");

      const fetcherA = vi.fn().mockResolvedValue("new-alpha");
      const a = await cache.get("a", 5000, fetcherA);
      expect(fetcherA).toHaveBeenCalledOnce();
      expect(a).toBe("new-alpha");

      // b should still be cached
      const fetcherB = vi.fn().mockResolvedValue("new-beta");
      const b = await cache.get("b", 5000, fetcherB);
      expect(fetcherB).not.toHaveBeenCalled();
      expect(b).toBe("beta");
    });
  });

  describe("fetcher error on cache miss", () => {
    it("propagates fetcher error when no cached entry", async () => {
      const cache = new SWRCache();
      await expect(
        cache.get("key", 5000, async () => {
          throw new Error("fetch failed");
        }),
      ).rejects.toThrow("fetch failed");
    });
  });
});
