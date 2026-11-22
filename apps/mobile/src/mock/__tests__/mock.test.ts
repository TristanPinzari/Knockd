import { crew, leaderboard, leadTotal, summary, useSessionUi } from "..";

describe("mock data", () => {
  test("leaderboard is ranked by leads, highest first", () => {
    const leads = leaderboard.map((row) => row.leads);
    expect([...leads].sort((a, b) => b - a)).toEqual(leads);
    expect(leaderboard.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  test("summary crew houses add up to the total", () => {
    const houses = summary.crew.reduce((sum, entry) => sum + entry.houses, 0);
    expect(houses).toBe(summary.housesWorked);
  });

  test("crew has exactly one host and one me", () => {
    expect(crew.filter((member) => member.isHost)).toHaveLength(1);
    expect(crew.filter((member) => member.isMe)).toHaveLength(1);
    expect(leadTotal(crew[0]!)).toBe(8);
  });

  test("session ui store toggles crew", () => {
    useSessionUi.getState().setCrewOn(true);
    expect(useSessionUi.getState().crewOn).toBe(true);
    useSessionUi.getState().setCrewOn(false);
  });
});
