import type { LeaderboardRow } from "../../realtime/leaderboard";
import { housesByMember, passedCopy } from "../teamProgress";

const row = (memberId: string, rank: number, isMe: boolean): LeaderboardRow => ({
  memberId,
  name: memberId,
  colour: "#000000",
  initials: "X",
  isMe,
  counts: { A: 0, B: 0, C: 0 },
  total: 0,
  rank,
});

describe("passedCopy", () => {
  it("says who passed you, your place, and how many leads to get it back", () => {
    const copy = passedCopy({ memberId: "sam", name: "Sam", theirLeads: 3, myLeads: 2, at: 0 }, [
      row("sam", 1, false),
      row("me", 2, true),
    ]);
    expect(copy).toEqual({ title: "Sam passed you", detail: "You're now 2nd in leads. 2 leads to take it back." });
  });
});

describe("housesByMember", () => {
  it("is empty before the first stats", () => {
    expect(housesByMember(null)).toEqual({});
  });
});
