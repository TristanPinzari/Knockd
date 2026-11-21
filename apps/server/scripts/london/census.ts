/**
 * Loads Statistics Canada 2021 dissemination areas (DAs) around London with their
 * median household income into `census_areas`.
 *
 * Needs two files in data/census/ (downloaded by hand; StatCan blocks scripts):
 *   - lda_000b21a_e.zip                    DA cartographic boundaries (shapefile)
 *   - 98-401-X2021006_Ontario_eng_CSV.zip  Census Profile, DA level, Ontario
 *
 * Usage: pnpm --filter @knockd/server data:census
 * Source: Statistics Canada, 2021 Census of Population (Open Government Licence – Canada).
 */
import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import * as shapefile from "shapefile";
import yauzl from "yauzl";
import { LONDON_BBOX } from "./config";

const CENSUS_DIR = fileURLToPath(new URL("../../data/census/", import.meta.url));
const BOUNDARY_ZIP = path.join(CENSUS_DIR, "lda_000b21a_e.zip");
const PROFILE_ZIP = path.join(CENSUS_DIR, "98-401-X2021006_Ontario_eng_CSV.zip");
const SHAPE_DIR = path.join(CENSUS_DIR, "lda");

/** Census Profile characteristic: "Median total income of household in 2020 ($)" */
const MEDIAN_HOUSEHOLD_INCOME_ID = "243";
const ONTARIO_PRUID = "35";
/** StatCan boundary files use Statistics Canada Lambert (EPSG:3347). */
const STATCAN_SRID = 3347;

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
for (const f of [BOUNDARY_ZIP, PROFILE_ZIP]) if (!existsSync(f)) throw new Error(`Missing ${f}`);

const sql = postgres(url, { max: 1, onnotice: () => {} });

// ---------- zip helpers ----------

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (err, zip) => (err ? reject(err) : resolve(zip!))),
  );
}

/** Calls onEntry for each file in the zip, one at a time. */
async function eachEntry(file: string, onEntry: (name: string, stream: () => Promise<Readable>) => Promise<void>) {
  const zip = await openZip(file);
  await new Promise<void>((resolve, reject) => {
    zip.on("entry", (entry: yauzl.Entry) => {
      const open = () =>
        new Promise<Readable>((res, rej) => zip.openReadStream(entry, (err, s) => (err ? rej(err) : res(s!))));
      onEntry(entry.fileName, open).then(() => zip.readEntry(), reject);
    });
    zip.on("end", resolve);
    zip.on("error", reject);
    zip.readEntry();
  });
  zip.close();
}

/** Splits one CSV line, handling quoted fields. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

try {
  // ---------- 1. Boundaries ----------
  if (!existsSync(path.join(SHAPE_DIR, "lda_000b21a_e.shp"))) {
    console.log("1/3 Extracting DA boundaries...");
    await mkdir(SHAPE_DIR, { recursive: true });
    await eachEntry(BOUNDARY_ZIP, async (name, open) => {
      if (/\.(shp|shx|dbf|prj)$/.test(name))
        await pipeline(await open(), createWriteStream(path.join(SHAPE_DIR, name)));
    });
  }

  console.log("1/3 Loading Ontario DA boundaries...");
  await sql.unsafe(`
    CREATE SCHEMA IF NOT EXISTS staging;
    DROP TABLE IF EXISTS staging.census_da;
    CREATE TABLE staging.census_da (dguid text PRIMARY KEY, geom geometry(MultiPolygon, 4326), income integer);
  `);
  const source = await shapefile.open(
    path.join(SHAPE_DIR, "lda_000b21a_e.shp"),
    path.join(SHAPE_DIR, "lda_000b21a_e.dbf"),
  );
  let batch: { dguid: string; geom: string }[] = [];
  let loaded = 0;
  const flush = async () => {
    if (!batch.length) return;
    await sql`
      INSERT INTO staging.census_da (dguid, geom)
      SELECT x->>'dguid', ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), ${STATCAN_SRID}), 4326))
      FROM jsonb_array_elements(${sql.json(batch)}) AS x`;
    loaded += batch.length;
    batch = [];
    process.stdout.write(`\r  ${loaded.toLocaleString()} Ontario DAs`);
  };
  for (let r = await source.read(); !r.done; r = await source.read()) {
    const props = r.value.properties as { DGUID: string; PRUID: string };
    if (props.PRUID !== ONTARIO_PRUID) continue;
    batch.push({ dguid: props.DGUID, geom: JSON.stringify(r.value.geometry) });
    if (batch.length >= 500) await flush();
  }
  await flush();
  process.stdout.write("\n");

  // Keep only DAs around London.
  const { south, west, north, east } = LONDON_BBOX;
  const [{ kept } = { kept: 0 }] = await sql<{ kept: number }[]>`
    WITH d AS (
      DELETE FROM staging.census_da
      WHERE NOT ST_Intersects(geom, ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326))
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM staging.census_da)::int - (SELECT count(*) FROM d)::int AS kept`;
  console.log(`  ${kept.toLocaleString()} DAs in the London area`);

  // ---------- 2. Income ----------
  console.log("2/3 Reading median household income (streams the 8.8 GB CSV, a few minutes)...");
  const wanted = new Set((await sql<{ dguid: string }[]>`SELECT dguid FROM staging.census_da`).map((r) => r.dguid));
  const incomes: { dguid: string; income: number }[] = [];
  let lines = 0;
  await eachEntry(PROFILE_ZIP, async (name, open) => {
    if (!name.includes("CSV_data")) return;
    const rl = createInterface({ input: await open(), crlfDelay: Infinity });
    for await (const line of rl) {
      if (++lines % 2_000_000 === 0) process.stdout.write(`\r  ${(lines / 1e6).toFixed(0)}M lines`);
      // Cheap check before parsing: the characteristic ID column is ",243,".
      if (!line.includes(`,${MEDIAN_HOUSEHOLD_INCOME_ID},"`)) continue;
      const f = splitCsv(line);
      const dguid = f[1]!;
      if (f[8] !== MEDIAN_HOUSEHOLD_INCOME_ID || !wanted.has(dguid)) continue;
      const income = Number(f[11]);
      if (f[11] !== "" && Number.isFinite(income)) incomes.push({ dguid, income });
    }
  });
  process.stdout.write("\n");
  console.log(`  ${incomes.length.toLocaleString()} DAs with income data`);

  // ---------- 3. Save ----------
  console.log("3/3 Writing census_areas...");
  await sql.begin(async (tx) => {
    await tx`
      UPDATE staging.census_da c SET income = (x->>'income')::int
      FROM jsonb_array_elements(${tx.json(incomes)}) AS x
      WHERE c.dguid = x->>'dguid'`;
    await tx`TRUNCATE census_areas`;
    await tx`
      INSERT INTO census_areas (dguid, geom, median_household_income)
      SELECT dguid, geom, income FROM staging.census_da`;
  });
  const [stats] = await sql`
    SELECT count(*)::int AS areas,
           count(median_household_income)::int AS with_income,
           min(median_household_income) AS min_income,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY median_household_income)::int AS median_income,
           max(median_household_income) AS max_income
    FROM census_areas`;
  console.log("✓ Done:", stats);
} finally {
  await sql.end();
}
