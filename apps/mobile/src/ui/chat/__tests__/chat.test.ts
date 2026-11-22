import { timeOfDay } from "../ChatSheet";

describe("timeOfDay", () => {
  it("shows a 12-hour clock time", () => {
    expect(timeOfDay(new Date(2026, 10, 22, 19, 5).toISOString())).toBe("7:05 pm");
    expect(timeOfDay(new Date(2026, 10, 22, 0, 30).toISOString())).toBe("12:30 am");
  });
});
