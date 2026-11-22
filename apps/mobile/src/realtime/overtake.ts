import { useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { useOvertakeStore, type OvertakeEvent } from "./stores/overtakeStore";
import { useSessionStore } from "./stores/sessionStore";
import { computeLeaderboard, type LeaderboardRow } from "./leaderboard";

export interface OvertakeDetector {
  /**
   * Feed the latest leaderboard. The first call only records a baseline. Afterwards returns one
   * event per teammate who had no more leads than me before and now has strictly more.
   * (Strictly more: a tie-break flip alone must not trigger "Sam passed you".)
   */
  update(rows: readonly LeaderboardRow[], now: number): OvertakeEvent[];
  reset(): void;
}

export function createOvertakeDetector(myMemberId: string): OvertakeDetector {
  let previous: ReadonlyMap<string, number> | null = null;

  return {
    update(rows, now) {
      const current = new Map(rows.map((r) => [r.memberId, r.total]));
      const before = previous;
      previous = current;
      const myNow = current.get(myMemberId);
      const myBefore = before?.get(myMemberId);
      if (!before || myNow === undefined || myBefore === undefined) return [];
      return rows.flatMap((row) => {
        if (row.memberId === myMemberId) return [];
        const theirBefore = before.get(row.memberId);
        if (theirBefore === undefined || theirBefore > myBefore || row.total <= myNow) return [];
        return [{ memberId: row.memberId, name: row.name, theirLeads: row.total, myLeads: myNow, at: now }];
      });
    },
    reset() {
      previous = null;
    },
  };
}

/**
 * Watches the stores and pushes "X passed you" events to useOvertakeStore. Paused while the session
 * is not synced, so loading the snapshot (members first, leads second) cannot fake an overtake.
 * Returns an unsubscribe function.
 */
export function startOvertakeWatcher(now: () => number = Date.now): () => void {
  let detector: OvertakeDetector | null = null;
  let detectorFor: string | null = null;

  const evaluate = (): void => {
    const { myMemberId, members } = useCrewStore.getState();
    if (!myMemberId || !useSessionStore.getState().synced) return;
    if (detectorFor !== myMemberId) {
      detector = createOvertakeDetector(myMemberId);
      detectorFor = myMemberId;
    }
    const rows = computeLeaderboard(Object.values(members), Object.values(useLeadsStore.getState().leads), myMemberId);
    const events = detector?.update(rows, now()) ?? [];
    const top = events[events.length - 1];
    if (top) useOvertakeStore.getState().push(top);
  };

  const unsubs = [
    useCrewStore.subscribe(evaluate),
    useLeadsStore.subscribe(evaluate),
    useSessionStore.subscribe(evaluate),
  ];
  evaluate();
  return () => unsubs.forEach((u) => u());
}
