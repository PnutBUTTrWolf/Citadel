import { describe, it, expect } from "vitest";
import {
  checkVersionCompatibility,
  MIN_GT_VERSION,
  MIN_BD_VERSION,
} from "./capabilities";

// parseVersion and compareVersions are private, but we test them indirectly
// through checkVersionCompatibility and the exported constants.

describe("checkVersionCompatibility", () => {
  describe("both versions compatible", () => {
    it("returns compatible when both meet minimum", () => {
      const result = checkVersionCompatibility(MIN_GT_VERSION, MIN_BD_VERSION);
      expect(result).toEqual({
        compatible: true,
        gtCompatible: true,
        bdCompatible: true,
      });
    });

    it("returns compatible when versions exceed minimum", () => {
      const result = checkVersionCompatibility("99.99.99", "99.99.99");
      expect(result).toEqual({
        compatible: true,
        gtCompatible: true,
        bdCompatible: true,
      });
    });
  });

  describe("gt version checks", () => {
    it("incompatible when gt version is below minimum", () => {
      const result = checkVersionCompatibility("0.0.1", MIN_BD_VERSION);
      expect(result.gtCompatible).toBe(false);
      expect(result.compatible).toBe(false);
    });

    it("incompatible when gt version is null", () => {
      const result = checkVersionCompatibility(null, MIN_BD_VERSION);
      expect(result.gtCompatible).toBe(false);
      expect(result.compatible).toBe(false);
    });

    it("compatible when gt version equals minimum", () => {
      const result = checkVersionCompatibility(MIN_GT_VERSION, MIN_BD_VERSION);
      expect(result.gtCompatible).toBe(true);
    });
  });

  describe("bd version checks", () => {
    it("incompatible when bd version is below minimum", () => {
      const result = checkVersionCompatibility(MIN_GT_VERSION, "0.0.1");
      expect(result.bdCompatible).toBe(false);
      expect(result.compatible).toBe(false);
    });

    it("incompatible when bd version is null", () => {
      const result = checkVersionCompatibility(MIN_GT_VERSION, null);
      expect(result.bdCompatible).toBe(false);
      expect(result.compatible).toBe(false);
    });

    it("compatible when bd version equals minimum", () => {
      const result = checkVersionCompatibility(MIN_GT_VERSION, MIN_BD_VERSION);
      expect(result.bdCompatible).toBe(true);
    });
  });

  describe("both versions null", () => {
    it("returns fully incompatible", () => {
      const result = checkVersionCompatibility(null, null);
      expect(result).toEqual({
        compatible: false,
        gtCompatible: false,
        bdCompatible: false,
      });
    });
  });

  describe("version comparison edge cases", () => {
    it("handles major version difference", () => {
      // MIN_GT_VERSION is 0.3.0 - a version with major=1 should be greater
      const result = checkVersionCompatibility("1.0.0", MIN_BD_VERSION);
      expect(result.gtCompatible).toBe(true);
    });

    it("handles minor version difference", () => {
      // MIN_GT_VERSION is 0.3.0
      const result = checkVersionCompatibility("0.4.0", MIN_BD_VERSION);
      expect(result.gtCompatible).toBe(true);
    });

    it("handles patch version difference", () => {
      // MIN_GT_VERSION is 0.3.0
      const result = checkVersionCompatibility("0.3.1", MIN_BD_VERSION);
      expect(result.gtCompatible).toBe(true);
    });

    it("lower minor version is incompatible", () => {
      const result = checkVersionCompatibility("0.2.99", MIN_BD_VERSION);
      expect(result.gtCompatible).toBe(false);
    });
  });
});

describe("exported constants", () => {
  it("MIN_GT_VERSION is a valid semver string", () => {
    expect(MIN_GT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("MIN_BD_VERSION is a valid semver string", () => {
    expect(MIN_BD_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
