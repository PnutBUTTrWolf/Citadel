import { describe, it, expect } from "vitest";
import { parseCliOutput, parseCliOutputOrThrow, parseCliArray } from "./contracts";

describe("parseCliOutput", () => {
  it("parses valid JSON", () => {
    const result = parseCliOutput<{ name: string }>('{"name":"test"}');
    expect(result).toEqual({ success: true, data: { name: "test" } });
  });

  it("parses JSON arrays", () => {
    const result = parseCliOutput<number[]>("[1,2,3]");
    expect(result).toEqual({ success: true, data: [1, 2, 3] });
  });

  it("parses JSON primitives", () => {
    expect(parseCliOutput<number>("42")).toEqual({ success: true, data: 42 });
    expect(parseCliOutput<string>('"hello"')).toEqual({
      success: true,
      data: "hello",
    });
    expect(parseCliOutput<boolean>("true")).toEqual({
      success: true,
      data: true,
    });
    expect(parseCliOutput<null>("null")).toEqual({ success: true, data: null });
  });

  it("returns error for invalid JSON", () => {
    const result = parseCliOutput("{bad json}");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("JSON parse error:");
    }
  });

  it("returns error for empty string", () => {
    const result = parseCliOutput("");
    expect(result.success).toBe(false);
  });

  it("returns error for plain text", () => {
    const result = parseCliOutput("Error: command not found");
    expect(result.success).toBe(false);
  });

  it("returns error for truncated JSON", () => {
    const result = parseCliOutput('{"name": "test"');
    expect(result.success).toBe(false);
  });

  it("handles JSON with nested objects", () => {
    const json = '{"a":{"b":{"c":1}}}';
    const result = parseCliOutput<{ a: { b: { c: number } } }>(json);
    expect(result).toEqual({ success: true, data: { a: { b: { c: 1 } } } });
  });
});

describe("parseCliOutputOrThrow", () => {
  it("returns data on valid JSON", () => {
    const data = parseCliOutputOrThrow<{ id: number }>('{"id":1}');
    expect(data).toEqual({ id: 1 });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseCliOutputOrThrow("not json")).toThrow("JSON parse error:");
  });

  it("throws on empty string", () => {
    expect(() => parseCliOutputOrThrow("")).toThrow();
  });
});

describe("parseCliArray", () => {
  it("parses valid JSON array", () => {
    const result = parseCliArray<number>("[1,2,3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("parses array of objects", () => {
    const json = '[{"id":"a"},{"id":"b"}]';
    const result = parseCliArray<{ id: string }>(json);
    expect(result).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseCliArray('{"not":"array"}')).toEqual([]);
  });

  it("returns empty array for JSON primitive", () => {
    expect(parseCliArray("42")).toEqual([]);
    expect(parseCliArray('"string"')).toEqual([]);
    expect(parseCliArray("true")).toEqual([]);
    expect(parseCliArray("null")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseCliArray("not json")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCliArray("")).toEqual([]);
  });

  it("parses empty array", () => {
    expect(parseCliArray("[]")).toEqual([]);
  });

  it("handles array with mixed types", () => {
    const result = parseCliArray<unknown>('[1,"two",true,null]');
    expect(result).toEqual([1, "two", true, null]);
  });
});
