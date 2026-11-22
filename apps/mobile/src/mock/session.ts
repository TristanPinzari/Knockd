export interface MockArea {
  id: string;
  name: string;
  houses: number;
}

export const suggestedAreas: readonly MockArea[] = [
  { id: "old-north", name: "Old North", houses: 640 },
  { id: "wortley", name: "Wortley Village", houses: 520 },
];

export const liveSession = { crew: 4, housesDone: 14, housesTotal: 22 } as const;

export const summary = {
  when: "Sat 21 Nov, 1:10 to 3:50 pm",
  housesWorked: 84,
  leads: 6,
  time: "2h 40m",
  grades: [
    { grade: "A", count: 2 },
    { grade: "B", count: 3 },
    { grade: "C", count: 1 },
  ],
  crew: [
    { id: "m-jas", houses: 28, leads: 3 },
    { id: "m-sam", houses: 24, leads: 2 },
    { id: "m-ava", houses: 20, leads: 1 },
    { id: "m-leo", houses: 12, leads: 0 },
  ],
} as const;

export const teams: readonly { id: string; name: string; members: number }[] = [
  { id: "t-lp", name: "London Painters", members: 4 },
  { id: "t-ad", name: "Agincourt Door Crew", members: 3 },
];

export const teamSplitOptions = [
  { id: 1, title: "Option 1", detail: "3 street crossings, ≈ 160 houses each", widths: [1, 1, 1, 1] },
  { id: 2, title: "Option 2", detail: "4 street crossings, ≈ 140 to 190 houses", widths: [1.3, 0.7, 1.2, 1] },
  { id: 3, title: "Option 3", detail: "6 street crossings, ≈ 150 to 180 houses", widths: [0.8, 1.3, 1, 1.1] },
] as const;

export const gradeOptions = [
  { grade: "A", text: "Wants it now" },
  { grade: "B", text: "Wants it within a year" },
  { grade: "C", text: "No interest, but the number is useful" },
] as const;
