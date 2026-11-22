import { DARK_MAP_COLOURS, LIGHT_MAP_COLOURS } from "@/map/constants";
import { darkColors, lightColors } from "../colors";
import { bySchemeOf } from "../scheme";

const keysDeep = (o: object, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? keysDeep(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe("colour palettes", () => {
  test("dark and light define the same app tokens", () => {
    expect(keysDeep(darkColors).sort()).toEqual(keysDeep(lightColors).sort());
  });

  test("dark and light define the same map tokens", () => {
    expect(Object.keys(DARK_MAP_COLOURS).sort()).toEqual(Object.keys(LIGHT_MAP_COLOURS).sort());
  });

  test("the dark map makes major roads stand out from minor ones, like the reference", () => {
    expect(DARK_MAP_COLOURS.roadMajor).not.toBe(DARK_MAP_COLOURS.roadFill);
    expect(DARK_MAP_COLOURS.land).not.toBe(LIGHT_MAP_COLOURS.land);
  });

  test("picks the value for the scheme", () => {
    expect(bySchemeOf("dark", { light: 1, dark: 2 })).toBe(2);
    expect(bySchemeOf("light", { light: 1, dark: 2 })).toBe(1);
  });
});
