import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "./circuitBreaker";

describe("CircuitBreaker smoke test", () => {
  it("starts in CLOSED state and allows execution", () => {
    const cb = new CircuitBreaker();
    expect(cb.canExecute()).toBe(true);
    expect(cb.getState()).toBe("CLOSED");
  });
});
