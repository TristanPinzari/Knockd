-- Builds streets, blocks and houses from staging.osm_roads and staging.osm_buildings.
-- Re-runnable, but refuses to run once real session data references the map.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM leads) OR EXISTS (SELECT 1 FROM session_street_coverage) OR EXISTS (SELECT 1 FROM session_block_stats) THEN
    RAISE EXCEPTION 'Sessions already reference this map data. Rebuilding would break them.';
  END IF;
END $$;

-- ---------- 1. Road network ----------
-- Roads that bound blocks. Service roads, footpaths and driveways don't split blocks.
DROP TABLE IF EXISTS staging.road_net;
CREATE TABLE staging.road_net AS
SELECT osm_id, tags->>'name' AS name, tags->>'highway' AS highway, geom
FROM staging.osm_roads
WHERE tags->>'highway' IN (
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'unclassified', 'residential', 'living_street'
);
CREATE INDEX ON staging.road_net USING gist (geom);

-- Split every road at every intersection.
DROP TABLE IF EXISTS staging.noded;
CREATE TABLE staging.noded AS
SELECT row_number() OVER () AS id, geom
FROM (SELECT (ST_Dump(ST_Node(ST_Collect(geom)))).geom AS geom FROM staging.road_net) d;
CREATE INDEX ON staging.noded USING gist (geom);

-- ---------- 2. Streets ----------
-- Segments of roads people actually knock along (not highways or ramps), with the original road's name.
TRUNCATE streets, blocks, houses RESTART IDENTITY CASCADE;

INSERT INTO streets (osm_id, name, geom, length_m)
SELECT DISTINCT ON (n.id) r.osm_id, r.name, n.geom, ST_Length(n.geom::geography)
FROM staging.noded n
JOIN staging.road_net r
  ON ST_DWithin(r.geom, ST_LineInterpolatePoint(n.geom, 0.5), 0.0000001)
WHERE r.highway IN ('residential', 'living_street', 'unclassified', 'tertiary', 'secondary', 'primary')
  AND ST_Length(n.geom::geography) > 5
ORDER BY n.id, r.osm_id;

-- ---------- 3. Blocks ----------
-- Areas fully enclosed by roads. Drop slivers and huge areas (farmland, industrial parks).
INSERT INTO blocks (geom)
SELECT geom
FROM (SELECT (ST_Dump(ST_Polygonize(geom))).geom AS geom FROM staging.noded) p
WHERE ST_Area(geom::geography) BETWEEN 1500 AND 400000;

-- ---------- 4. Houses ----------
-- House-sized residential buildings. Garages and sheds are too small; plazas and apartments too big.
INSERT INTO houses (geom, centroid)
SELECT geom, ST_PointOnSurface(geom)
FROM staging.osm_buildings
WHERE tags->>'building' IN ('yes', 'house', 'detached', 'semidetached_house', 'terrace', 'residential', 'bungalow')
  AND NOT (tags ? 'shop' OR tags ? 'amenity' OR tags ? 'office' OR tags ? 'craft')
  AND ST_Area(geom::geography) BETWEEN 40 AND 600;

UPDATE houses h
SET block_id = b.id
FROM blocks b
WHERE ST_Within(h.centroid, b.geom);

-- Nearest street within ~70 m.
UPDATE houses h
SET street_id = (
  SELECT s.id FROM streets s
  WHERE ST_DWithin(s.geom, h.centroid, 0.0009)
  ORDER BY s.geom <-> h.centroid
  LIMIT 1
);

-- ---------- 5. Street blocks for houses outside a normal block ----------
-- In subdivisions, cul-de-sacs and crescents don't form closed loops, so the arterials around them
-- enclose one huge area that step 3 drops. Group those houses by their street instead: each
-- cul-de-sac or crescent becomes its own block, which is how crews work them anyway.
WITH groups AS (
  SELECT street_id, ST_ConvexHull(ST_Collect(geom)) AS hull
  FROM houses
  WHERE block_id IS NULL AND street_id IS NOT NULL
  GROUP BY street_id
  HAVING count(*) >= 3
),
inserted AS (
  INSERT INTO blocks (geom)
  SELECT hull FROM groups WHERE GeometryType(hull) = 'POLYGON'
  RETURNING id, geom
)
UPDATE houses h
SET block_id = i.id
FROM inserted i
JOIN groups g ON g.hull = i.geom
WHERE h.block_id IS NULL AND h.street_id = g.street_id;

-- ---------- 6. Block house counts ----------
UPDATE blocks b
SET house_count = c.n
FROM (SELECT block_id, count(*)::int AS n FROM houses WHERE block_id IS NOT NULL GROUP BY block_id) c
WHERE c.block_id = b.id;

-- Blocks with no houses (parks, schools, commercial) aren't useful for planning.
DELETE FROM blocks WHERE house_count = 0;

ANALYZE streets;
ANALYZE blocks;
ANALYZE houses;
