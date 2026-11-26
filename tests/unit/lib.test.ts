import { describe, expect, it } from "vitest";
import { formatAhv, isValidAhv, maskAhv } from "@/lib/ahv";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { toCsv } from "@/lib/csv";

// Fictitious, formally valid test number (EAN-13 check digit), not a real person.
const AHV = "7561234567897";

describe("AHV", () => {
  it("accepts a formally valid number in any notation", () => {
    expect(isValidAhv(AHV)).toBe(true);
    expect(isValidAhv("756.1234.5678.97")).toBe(true);
  });
  it("rejects wrong check digit, prefix and length", () => {
    expect(isValidAhv("7561234567890")).toBe(false);
    expect(isValidAhv("7571234567897")).toBe(false);
    expect(isValidAhv("756123456789")).toBe(false);
  });
  it("formats and masks", () => {
    expect(formatAhv(AHV)).toBe("756.1234.5678.97");
    expect(maskAhv(AHV)).toBe("756.••••.••••.97");
  });
});

describe("Telefon", () => {
  it("normalises Swiss notations to E.164", () => {
    expect(normalizePhone("079 000 00 01")).toBe("+41790000001");
    expect(normalizePhone("0041 79 000 00 01")).toBe("+41790000001");
    expect(normalizePhone("+41 (0)79")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
  it("formats Swiss numbers", () => {
    expect(formatPhone("+41790000001")).toBe("+41 79 000 00 01");
  });
});

describe("CSV-Export", () => {
  it("adds BOM, uses semicolons and quotes special characters", () => {
    const out = toCsv([["a", 'b"c', "d;e"], [1, null, undefined]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out.slice(1)).toBe('a;"b""c";"d;e"\r\n1;;');
  });
  it("neutralises formula injection", () => {
    for (const bad of ["=SUM(A1)", "+1", "-2", "@x"]) {
      expect(toCsv([[bad]]).slice(1)).toBe("'" + bad);
    }
  });
});
