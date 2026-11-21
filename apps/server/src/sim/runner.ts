/**
 * Simulated crew: bots that join a real session and walk real streets, sending GPS pings and the
 * odd lead through the same code as phones. Used for the demo and for testing the app indoors.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { distanceM, type Grade, type Ping, type SimPace } from "@knockd/shared";
import { db } from "../db/client";
import { sessionMembers, sessions } from "../db/schema";
import { HttpError } from "../http/errors";
import { logger } from "../logger";
import { emitToSession, setVirtualPresence } from "../realtime/io";
import { getPlan } from "../sessions/planning";
import { addMembers, getMembers } from "../sessions/service";
import { addLead, addPings } from "../sessions/writes";
import { planRoutes, type Stop } from "./routes";

const BOT_NAMES = ["Alex", "Sam", "Jordan", "Taylor", "Riley", "Casey", "Morgan"];
const WALK_SPEED_MS = 1.3;
const TICK_MS = 1000;
const SAMPLE_EVERY_TICKS = 5; // a GPS point every 5 s
const FLUSH_EVERY_TICKS = 15; // uploaded in batches every 15 s, like a phone
const GPS_JITTER_M = 3;
const LEAD_CHANCE: Record<SimPace, number> = { demo: 0.06, realistic: 0.08 };
const GRADES: [Grade, number][] = [
  ["A", 0.25],
  ["B", 0.35],
  ["C", 0.4],
];

interface Bot {
  memberId: string;
  route: Stop[];
  next: number;
  lat: number;
  lng: number;
  waitS: number;
  pending: Ping[];
}

interface Run {
  sessionId: string;
  pace: SimPace;
  bots: Bot[];
  timer: NodeJS.Timeout;
  ticks: number;
  usedHouses: Set<number>;
  busy: boolean;
}

const runs = new Map<string, Run>();

export const isSimRunning = (sessionId: string) => runs.has(sessionId);

export async function startSim(sessionId: string, count: number, pace: SimPace): Promise<string[]> {
  if (runs.has(sessionId)) throw new HttpError(409, "conflict", "A simulated crew is already running in this session");

  const names = BOT_NAMES.slice(0, count).map((n) => `${n} (sim)`);
  const added = await addMembers(
    sessionId,
    names.map((displayName) => ({ displayName, isBot: true })),
  );
  const botIds = added.map((a) => a.memberId);

  let routes: Awaited<ReturnType<typeof planRoutes>>;
  try {
    routes = await planRoutes(sessionId, botIds, pace, (await getPlan(sessionId)).plan);
  } catch (err) {
    await markLeft(botIds); // don't leave bots behind if there's nothing to walk
    throw err;
  }

  const members = await getMembers(sessionId);
  for (const id of botIds) {
    const member = members.find((m) => m.id === id);
    if (member) emitToSession(sessionId, "member:joined", { member });
    setVirtualPresence(sessionId, id, true);
  }

  const bots: Bot[] = botIds.map((memberId) => {
    const route = routes.get(memberId) ?? [];
    return { memberId, route, next: 0, lat: route[0]?.lat ?? 0, lng: route[0]?.lng ?? 0, waitS: 0, pending: [] };
  });
  const run: Run = {
    sessionId,
    pace,
    bots: bots.filter((b) => b.route.length),
    ticks: 0,
    usedHouses: new Set(),
    busy: false,
    timer: setInterval(() => void tick(run), TICK_MS),
  };
  runs.set(sessionId, run);
  logger.info({ sessionId, bots: run.bots.length, pace }, "simulated crew started");
  return botIds;
}

/** Stops the bots. `leave` also removes them from the session (frees their spots). */
export async function stopSim(sessionId: string, { leave }: { leave: boolean }): Promise<void> {
  const run = runs.get(sessionId);
  if (!run) throw new HttpError(404, "not_found", "No simulated crew is running in this session");
  await finish(run, leave);
}

export async function stopAllSims(): Promise<void> {
  await Promise.all([...runs.values()].map((r) => finish(r, false)));
}

async function finish(run: Run, leave: boolean) {
  clearInterval(run.timer);
  runs.delete(run.sessionId);
  await flush(run).catch(() => {});
  for (const bot of run.bots) {
    setVirtualPresence(run.sessionId, bot.memberId, false);
    if (leave) emitToSession(run.sessionId, "member:left", { memberId: bot.memberId });
  }
  if (leave) await markLeft(run.bots.map((b) => b.memberId));
  logger.info({ sessionId: run.sessionId, leave }, "simulated crew stopped");
}

async function markLeft(memberIds: string[]) {
  if (!memberIds.length) return;
  await db
    .update(sessionMembers)
    .set({ leftAt: new Date() })
    .where(and(inArray(sessionMembers.id, memberIds), eq(sessionMembers.isBot, true)));
}

// ============================== Simulation loop ==============================

async function tick(run: Run) {
  if (run.busy) return; // previous tick's database work still running
  run.busy = true;
  try {
    run.ticks++;
    for (const bot of run.bots) await step(run, bot);
    if (run.ticks % SAMPLE_EVERY_TICKS === 0) for (const bot of run.bots) sample(bot);
    if (run.ticks % FLUSH_EVERY_TICKS === 0) {
      await flush(run);
      // Late writes are allowed after a session ends, so stop the bots ourselves.
      const [s] = await db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, run.sessionId));
      if (s?.status !== "live") await finish(run, false);
    }
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 410)) {
      await finish(run, false); // session ended or gone
    } else {
      logger.error({ err, sessionId: run.sessionId }, "simulated crew tick failed");
    }
  } finally {
    run.busy = false;
  }
}

/** One second of a bot's life: stand at a door, or walk toward the next point. */
async function step(run: Run, bot: Bot) {
  if (bot.waitS > 0) {
    bot.waitS -= TICK_MS / 1000;
    return;
  }
  const target = bot.route[bot.next];
  if (!target) return; // finished the route: stays put
  const budget = WALK_SPEED_MS * (TICK_MS / 1000);
  const d = distanceM(bot, target);
  if (d > budget) {
    const f = budget / d;
    bot.lat += (target.lat - bot.lat) * f;
    bot.lng += (target.lng - bot.lng) * f;
    return;
  }
  // Arrived at the point.
  bot.lat = target.lat;
  bot.lng = target.lng;
  bot.next++;
  bot.waitS = target.stopS;
  if (target.stopS > 0 && Math.random() < LEAD_CHANCE[run.pace]) await markLead(run, bot, target);
}

async function markLead(run: Run, bot: Bot, at: Stop) {
  const houseId = at.houseIds.find((id) => !run.usedHouses.has(id));
  if (houseId === undefined) return;
  run.usedHouses.add(houseId);
  await addLead(run.sessionId, bot.memberId, {
    clientId: randomUUID(),
    t: new Date().toISOString(),
    houseId,
    grade: pickGrade(),
  });
}

function sample(bot: Bot) {
  const jitter = () => (Math.random() * 2 - 1) * GPS_JITTER_M;
  bot.pending.push({
    clientId: randomUUID(),
    t: new Date().toISOString(),
    lat: bot.lat + jitter() / 111_320,
    lng: bot.lng + jitter() / (111_320 * Math.cos((bot.lat * Math.PI) / 180)),
    accuracy: 4 + Math.random() * 6,
  });
}

async function flush(run: Run) {
  for (const bot of run.bots) {
    if (!bot.pending.length) continue;
    const pings = bot.pending;
    bot.pending = [];
    await addPings(run.sessionId, bot.memberId, { pings });
  }
}

function pickGrade(): Grade {
  let r = Math.random();
  for (const [grade, p] of GRADES) if ((r -= p) <= 0) return grade;
  return "C";
}
