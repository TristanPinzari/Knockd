-- Every team has at least one map: give teams without any a "World Map" (no boundary = all their work).
-- New teams get one when they're created (teams/service.ts).
INSERT INTO maps (team_id, name, created_by)
SELECT t.id, 'World Map', t.created_by
FROM teams t
WHERE NOT EXISTS (SELECT 1 FROM maps m WHERE m.team_id = t.id);
