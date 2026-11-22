import { existsSync } from "fs";
import { join } from "path";
import { TAB_ITEMS } from "../TabBar";

const TABS_DIR = join(__dirname, "../../../app/(tabs)");

describe("TAB_ITEMS", () => {
  test("lists the five tabs in bar order", () => {
    expect(TAB_ITEMS.map((item) => item.label)).toEqual(["Home", "Session", "Chat", "Leaderboard", "Settings"]);
  });

  test("every tab route has a screen file in app/(tabs)", () => {
    const missing = TAB_ITEMS.filter((item) => !existsSync(join(TABS_DIR, `${item.route}.tsx`)));
    expect(missing).toEqual([]);
  });
});
