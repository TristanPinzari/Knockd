/**
 * Teams: members and roles, invite links, and uploading sessions.
 * Roles:
 *   owner   one per team. Everything, plus invites, roles, removing people, team settings, deleting
 *   editor  also creates/deletes highlights, notes and maps, and removes sessions
 *   viewer  sees everything and uploads sessions
 */
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type {
  CreateInviteRes,
  GetMeRes,
  GetMySessionsRes,
  PatchTeamBody,
  Team,
  TeamMember,
  TeamRole,
  TeamSessionSummary,
  UploadSessionRes,
} from "@knockd/shared";
import { db } from "../db/client";
import { maps, sessionMembers, sessions, teamInvites, teamMembers, teams, teamSessions, users } from "../db/schema";
import { env } from "../env";
import { forbidden, HttpError, notFound } from "../http/errors";

const INVITE_TTL_DAYS = 7;

const toTeam = (t: typeof teams.$inferSelect): Team => ({
  id: t.id,
  name: t.name,
  fadeDays: t.fadeDays,
  createdAt: t.createdAt.toISOString(),
});

// ============================== Access ==============================

/** The user's role on the team. 404 if the team doesn't exist or they're not on it (don't reveal which). */
export async function requireMember(teamId: string, userId: string): Promise<TeamRole> {
  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  if (!m) throw notFound("Team not found");
  return m.role;
}

/** Owners and editors. */
export async function requireEditor(teamId: string, userId: string): Promise<TeamRole> {
  const role = await requireMember(teamId, userId);
  if (role === "viewer") throw forbidden("Only team owners and editors can do that");
  return role;
}

export async function requireOwner(teamId: string, userId: string): Promise<void> {
  const role = await requireMember(teamId, userId);
  if (role !== "owner") throw forbidden("Only the team owner can do that");
}

// ============================== Me ==============================

export async function getMe(userId: string): Promise<GetMeRes> {
  const [user] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId));
  const rows = await db
    .select({ id: teams.id, name: teams.name, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId))
    .orderBy(teams.name);
  return { user: user!, teams: rows };
}

export async function renameMe(userId: string, displayName: string) {
  const [user] = await db
    .update(users)
    .set({ displayName })
    .where(eq(users.id, userId))
    .returning({ id: users.id, displayName: users.displayName });
  return { user: user! };
}

/** Sessions the user was in (as an account), newest first, with which teams they were uploaded to. */
export async function getMySessions(userId: string): Promise<GetMySessionsRes> {
  const rows = await db.execute<{
    id: string;
    started_at: Date;
    ended_at: Date | null;
    status: "live" | "ended" | "processed";
    uploaded_to: string[];
  }>(sql`
    SELECT s.id, s.started_at, s.ended_at, s.status,
           coalesce(array_agg(DISTINCT ts.team_id) FILTER (WHERE ts.team_id IS NOT NULL), '{}') AS uploaded_to
    FROM sessions s
    JOIN session_members m ON m.session_id = s.id AND m.user_id = ${userId} AND m.removed_at IS NULL
    LEFT JOIN team_sessions ts ON ts.session_id = s.id
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT 50`);
  return {
    sessions: rows.map((r) => ({
      id: r.id,
      startedAt: new Date(r.started_at).toISOString(),
      endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
      status: r.status,
      uploadedTo: r.uploaded_to,
    })),
  };
}

// ============================== Teams ==============================

export async function createTeam(userId: string, name: string): Promise<Team> {
  return db.transaction(async (tx) => {
    const [team] = await tx.insert(teams).values({ name, createdBy: userId }).returning();
    await tx.insert(teamMembers).values({ teamId: team!.id, userId, role: "owner" });
    // Every team starts with a map of all its work (no boundary). More maps can be added later.
    await tx.insert(maps).values({ teamId: team!.id, name: "World Map", createdBy: userId });
    return toTeam(team!);
  });
}

export async function getTeam(teamId: string, userId: string): Promise<Team> {
  await requireMember(teamId, userId);
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  return toTeam(team!);
}

export async function updateTeam(teamId: string, userId: string, body: PatchTeamBody): Promise<Team> {
  await requireOwner(teamId, userId);
  const [team] = await db
    .update(teams)
    .set({ ...(body.name && { name: body.name }), ...(body.fadeDays && { fadeDays: body.fadeDays }) })
    .where(eq(teams.id, teamId))
    .returning();
  return toTeam(team!);
}

export async function deleteTeam(teamId: string, userId: string): Promise<void> {
  await requireOwner(teamId, userId);
  // Cascades to members, invites, maps, highlights, notes and uploads. Sessions themselves are kept
  // (other teams may have them); un-uploaded ones are cleaned up after 7 days.
  await db.delete(teams).where(eq(teams.id, teamId));
}

// ============================== Members ==============================

export async function listMembers(teamId: string, userId: string): Promise<TeamMember[]> {
  await requireMember(teamId, userId);
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, role: teamMembers.role, joinedAt: teamMembers.joinedAt })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(teamMembers.joinedAt);
  return rows.map((r) => ({
    user: { id: r.id, displayName: r.displayName },
    role: r.role,
    joinedAt: r.joinedAt.toISOString(),
  }));
}

/** Owner only. */
export async function setMemberRole(teamId: string, userId: string, targetId: string, role: "editor" | "viewer") {
  await requireOwner(teamId, userId);
  const targetRole = await requireMember(teamId, targetId).catch(() => {
    throw notFound("Not a member of this team");
  });
  if (targetRole === "owner") throw forbidden("The owner's role can't be changed");
  await db
    .update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetId)));
}

/** The owner removes others; anyone except the owner can remove themselves (leave). */
export async function removeMember(teamId: string, userId: string, targetId: string): Promise<void> {
  const myRole = await requireMember(teamId, userId);
  const targetRole = await requireMember(teamId, targetId).catch(() => {
    throw notFound("Not a member of this team");
  });
  if (targetRole === "owner") throw forbidden("The owner can't leave or be removed. Delete the team instead");
  if (targetId !== userId && myRole !== "owner") throw forbidden("Only the team owner can remove people");
  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetId)));
}

// ============================== Invites ==============================

/** Owner only. A reusable link, valid for 7 days. People who accept join as viewers. */
export async function createInvite(teamId: string, userId: string): Promise<CreateInviteRes> {
  await requireOwner(teamId, userId);
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  await db.insert(teamInvites).values({ token, teamId, createdBy: userId, expiresAt });
  return { token, url: `${env.INVITE_BASE_URL}/${token}`, expiresAt: expiresAt.toISOString() };
}

export async function acceptInvite(token: string, userId: string): Promise<Team> {
  const [invite] = await db.select().from(teamInvites).where(eq(teamInvites.token, token));
  if (!invite) throw notFound("Invite not found");
  if (invite.expiresAt < new Date()) throw new HttpError(410, "conflict", "This invite has expired");
  await db.insert(teamMembers).values({ teamId: invite.teamId, userId, role: "viewer" }).onConflictDoNothing();
  const [team] = await db.select().from(teams).where(eq(teams.id, invite.teamId));
  if (!team) throw notFound("Team not found");
  return toTeam(team);
}

// ============================== Sessions ==============================

/**
 * Upload a session to a team. You must be on the team and have been in the session (logged in).
 * Uploading the same session twice is a no-op.
 */
export async function uploadSession(teamId: string, userId: string, sessionId: string): Promise<UploadSessionRes> {
  await requireMember(teamId, userId);
  const [row] = await db
    .select({ status: sessions.status })
    .from(sessions)
    .innerJoin(sessionMembers, eq(sessionMembers.sessionId, sessions.id))
    .where(and(eq(sessions.id, sessionId), eq(sessionMembers.userId, userId)))
    .limit(1);
  if (!row) throw notFound("You weren't in that session (or weren't logged in when you joined)");
  if (row.status === "live") throw new HttpError(409, "conflict", "End the session before uploading it");
  const inserted = await db
    .insert(teamSessions)
    .values({ teamId, sessionId, uploadedBy: userId })
    .onConflictDoNothing()
    .returning({ sessionId: teamSessions.sessionId });
  return { uploaded: true, alreadyUploaded: inserted.length === 0 };
}

export async function removeTeamSession(teamId: string, userId: string, sessionId: string): Promise<void> {
  await requireEditor(teamId, userId);
  const deleted = await db
    .delete(teamSessions)
    .where(and(eq(teamSessions.teamId, teamId), eq(teamSessions.sessionId, sessionId)))
    .returning({ sessionId: teamSessions.sessionId });
  if (!deleted.length) throw notFound("That session isn't on this team");
}

export async function listTeamSessions(
  teamId: string,
  userId: string,
  range: { from?: string; to?: string; sessionId?: string },
): Promise<TeamSessionSummary[]> {
  await requireMember(teamId, userId);
  const rows = await db.execute<{
    id: string;
    started_at: Date;
    ended_at: Date | null;
    uploaded_at: Date;
    uploader_id: string;
    uploader_name: string;
    member_names: string[];
    a: number;
    b: number;
    c: number;
    houses: number;
  }>(sql`
    SELECT s.id, s.started_at, s.ended_at, ts.uploaded_at, u.id AS uploader_id, u.display_name AS uploader_name,
      (SELECT coalesce(array_agg(m.display_name ORDER BY m.joined_at), '{}') FROM session_members m
        WHERE m.session_id = s.id AND m.removed_at IS NULL) AS member_names,
      (SELECT count(*) FILTER (WHERE grade = 'A')::int FROM leads l WHERE l.session_id = s.id AND l.deleted_at IS NULL) AS a,
      (SELECT count(*) FILTER (WHERE grade = 'B')::int FROM leads l WHERE l.session_id = s.id AND l.deleted_at IS NULL) AS b,
      (SELECT count(*) FILTER (WHERE grade = 'C')::int FROM leads l WHERE l.session_id = s.id AND l.deleted_at IS NULL) AS c,
      (SELECT coalesce(sum(houses_worked), 0)::int FROM session_block_stats b WHERE b.session_id = s.id) AS houses
    FROM team_sessions ts
    JOIN sessions s ON s.id = ts.session_id
    JOIN users u ON u.id = ts.uploaded_by
    WHERE ts.team_id = ${teamId}
      ${range.from ? sql`AND s.started_at >= ${range.from}` : sql``}
      ${range.to ? sql`AND s.started_at < ${range.to}` : sql``}
      ${range.sessionId ? sql`AND s.id = ${range.sessionId}` : sql``}
    ORDER BY s.started_at DESC
    LIMIT 200`);
  return rows.map((r) => ({
    id: r.id,
    startedAt: new Date(r.started_at).toISOString(),
    endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
    memberNames: r.member_names,
    leads: { A: r.a, B: r.b, C: r.c },
    housesCovered: r.houses,
    uploadedBy: { id: r.uploader_id, displayName: r.uploader_name },
    uploadedAt: new Date(r.uploaded_at).toISOString(),
  }));
}
