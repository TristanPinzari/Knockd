import { keyboardInset, sheetMaxHeight } from "../keyboardInset";

describe("keyboardInset", () => {
  test("is how far the keyboard's top edge sits above the bottom of the window", () => {
    expect(keyboardInset(874 - 336, 874)).toBe(336);
  });

  test("is zero once the keyboard has slid off screen", () => {
    expect(keyboardInset(874, 874)).toBe(0);
    expect(keyboardInset(900, 874)).toBe(0);
  });
});

describe("sheetMaxHeight", () => {
  test("leaves no limit while the keyboard is down", () => {
    expect(sheetMaxHeight(874, 0, 62)).toBeUndefined();
  });

  test("keeps a lifted sheet below the status bar", () => {
    expect(sheetMaxHeight(874, 336, 62)).toBe(874 - 336 - 62 - 16);
  });
});
