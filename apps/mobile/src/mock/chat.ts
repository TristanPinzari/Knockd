export type ChatItem =
  | { kind: "time"; id: string; text: string }
  | { kind: "message"; id: string; from: string; initials: string; colour: string; text: string; mine?: boolean }
  | { kind: "pin"; id: string; from: string; initials: string; colour: string; label: string; distance: string }
  | { kind: "event"; id: string; text: string }
  | { kind: "typing"; id: string; from: string; initials: string; colour: string };

const GREEN = "#0E8A5B";
const PURPLE = "#7C4DDB";
const PINK = "#C73A8A";

export const chatThread: readonly ChatItem[] = [
  { kind: "time", id: "c0", text: "Today, 6:42 pm" },
  { kind: "message", id: "c1", from: "Sam M.", initials: "SM", colour: GREEN, text: "Starting on Oak St" },
  {
    kind: "pin",
    id: "c2",
    from: "Ava V.",
    initials: "AV",
    colour: PURPLE,
    label: "Heading here",
    distance: "Maple Ave, 120 m away",
  },
  {
    kind: "message",
    id: "c3",
    from: "Jas K.",
    initials: "JK",
    colour: "#1F6FD6",
    text: "Nice, I'll take Elm Rd",
    mine: true,
  },
  { kind: "event", id: "c4", text: "Sam logged an A lead on Oak St" },
  { kind: "message", id: "c5", from: "Leo P.", initials: "LP", colour: PINK, text: "Anyone near the car?" },
  { kind: "typing", id: "c6", from: "Ava V.", initials: "AV", colour: PURPLE },
];

export const quickReplies = ["On my way", "Need a hand", "Regroup at car"] as const;

export const shareActions = [
  { icon: "map-pin", title: "Heading here", detail: "Drops a pin on the map for everyone" },
  { icon: "lifebuoy", title: "Need a hand", detail: "Alerts your crew to come find you" },
  { icon: "flag", title: "Regroup at the car", detail: "Asks everyone to head back to the car" },
] as const;
