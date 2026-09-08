import { describe, expect, it } from "vitest";
import { productCardsFromContext } from "../segments";

describe("productCardsFromContext", () => {
  it("splits a sourced product list from the company description", () => {
    const cards = productCardsFromContext(
      {
        businessSummary:
          "The company provides software including cloud storage, payments, and advertising tools for merchants worldwide.",
        news: [],
        highlights: [],
        references: [],
      },
      [],
    );
    expect(cards.map((c) => c.name)).toEqual(["cloud storage", "payments", "advertising tools for merchants worldwide"]);
  });
});
