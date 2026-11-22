import { darkColors, lightColors } from "../colors";
import { DARK_MAP_COLOURS, LIGHT_MAP_COLOURS } from "../mapPalettes";
import { resolveScheme } from "../scheme";
import { themes } from "../themes";

const keysDeep = (o: object, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? keysDeep(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe("themes", () => {
  test("light and dark define the same app tokens", () => {
    expect(keysDeep(darkColors).sort()).toEqual(keysDeep(lightColors).sort());
  });

  test("light and dark define the same map tokens", () => {
    expect(Object.keys(DARK_MAP_COLOURS).sort()).toEqual(Object.keys(LIGHT_MAP_COLOURS).sort());
  });

  test("each theme bundles its app and map colours", () => {
    expect(themes.light).toMatchObject({ name: "light", colors: lightColors, map: LIGHT_MAP_COLOURS });
    expect(themes.dark).toMatchObject({ name: "dark", colors: darkColors, map: DARK_MAP_COLOURS });
  });

  test("the dark map makes major roads stand out from minor streets, like the reference", () => {
    expect(DARK_MAP_COLOURS.roadMajor).not.toBe(DARK_MAP_COLOURS.roadFill);
  });
});

describe("resolveScheme", () => {
  test("a forced preview scheme wins over everything", () => {
    expect(resolveScheme("dark", "light", "light")).toBe("dark");
  });

  test("the Settings choice wins over the phone's appearance", () => {
    expect(resolveScheme(undefined, "light", "dark")).toBe("light");
    expect(resolveScheme(undefined, "dark", "light")).toBe("dark");
  });

  test("System follows the phone, defaulting to light", () => {
    expect(resolveScheme(undefined, "system", "dark")).toBe("dark");
    expect(resolveScheme(undefined, "system", null)).toBe("light");
    expect(resolveScheme("nonsense", "system", undefined)).toBe("light");
  });
});
