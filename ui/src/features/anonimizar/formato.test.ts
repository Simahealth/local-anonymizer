import { describe, expect, it } from "vitest";
import { formatearTamano, plural } from "./formato";

describe("formato", () => {
  it("tamaños legibles", () => {
    expect(formatearTamano(512)).toBe("512 B");
    expect(formatearTamano(2048)).toBe("2 KB");
    expect(formatearTamano(5 * 1024 * 1024 + 300_000)).toBe("5,3 MB");
  });
  it("plural en español", () => {
    expect(plural(1, "documento", "documentos")).toBe("1 documento");
    expect(plural(1200, "documento", "documentos")).toBe("1.200 documentos");
  });
});
