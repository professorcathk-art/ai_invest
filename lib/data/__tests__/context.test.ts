import { describe, expect, it } from "vitest";
import { isTickerRelatedHeadline } from "../context";

describe("headline relevance", () => {
  it("keeps Bank of China headlines and drops unrelated market color", () => {
    expect(isTickerRelatedHeadline("Bank of China posts stable net interest margin", "3988.HK", "Bank of China Limited")).toBe(
      true,
    );
    expect(isTickerRelatedHeadline("3988.HK rises after results", "3988.HK", "Bank of China Limited")).toBe(true);
    expect(isTickerRelatedHeadline("Oil jumps as OPEC+ signals cuts", "3988.HK", "Bank of China Limited")).toBe(false);
  });
});
