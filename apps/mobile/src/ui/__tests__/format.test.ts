import { clamp, initialsOf, ordinal, stepValue, toPercent } from "../format";

describe("format helpers", () => {
  test("clamp keeps values inside the range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  test("toPercent rounds and clamps fractions", () => {
    expect(toPercent(0.64)).toBe("64%");
    expect(toPercent(1.4)).toBe("100%");
    expect(toPercent(-0.2)).toBe("0%");
  });

  test("initialsOf takes the first letters of up to two words", () => {
    expect(initialsOf("Jas K.")).toBe("JK");
    expect(initialsOf("london painters crew")).toBe("LP");
    expect(initialsOf("")).toBe("");
  });

  test("ordinal handles suffix edge cases", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
    ]);
  });

  test("stepValue steps by decimals and clamps", () => {
    expect(stepValue(1.25, 0.25, 0.1, 3)).toBe(1.5);
    expect(stepValue(3, 0.25, 0.1, 3)).toBe(3);
    expect(stepValue(1, -1, 1, 8)).toBe(1);
  });
});
