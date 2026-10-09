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

describe("duraciones y memoria", async () => {
  const { formatearDuracion, formatearMb } = await import("./formato");
  it("formatea", () => {
    expect(formatearDuracion(30)).toBe("menos de un minuto");
    expect(formatearDuracion(600)).toBe("10 min");
    expect(formatearDuracion(5 * 3600 + 120)).toBe("5 h 2 min");
    expect(formatearMb(512)).toBe("512 MB");
    expect(formatearMb(6144)).toBe("6,0 GB");
  });
});
