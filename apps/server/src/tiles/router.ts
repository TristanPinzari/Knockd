/**
 * Basemap for MapLibre, from one Protomaps file (data/tiles/london.pmtiles, built into the image).
 *
 *   GET /tiles/style.json          ready-to-use MapLibre style (Protomaps "light"), XYZ source below
 *   GET /tiles/style-dark.json     the same in Protomaps "dark" (the website's dark mode)
 *   GET /tiles/{z}/{x}/{y}.mvt     vector tiles read from the archive: works in any MapLibre,
 *                                  including React Native offline packs
 *   GET /tiles/london.pmtiles      the raw archive (HTTP range requests), for pmtiles:// on the web
 */
import { open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import { env } from "../env";
import { HttpError } from "../http/errors";

const ARCHIVE = path.resolve(env.TILES_DIR, "london.pmtiles");
const ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';
const ASSETS = "https://protomaps.github.io/basemaps-assets";

/** pmtiles Source that reads byte ranges from a local file. */
class LocalFileSource implements Source {
  private handle: Promise<FileHandle> | null = null;
  constructor(private readonly file: string) {}
  getKey() {
    return this.file;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.handle ??= open(this.file, "r");
    const buf = Buffer.alloc(length);
    const { bytesRead } = await (await this.handle).read(buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) };
  }
}

let archive: PMTiles | null = null;
async function getArchive(): Promise<PMTiles> {
  if (!archive) {
    const candidate = new PMTiles(new LocalFileSource(ARCHIVE));
    try {
      await candidate.getHeader();
    } catch {
      throw new HttpError(503, "internal", "Map tiles aren't available on this server");
    }
    archive = candidate;
  }
  return archive;
}

const baseUrl = (req: Request) => `${req.protocol}://${req.get("host")}`;

export const tilesRouter = Router();

/** A MapLibre style for our tiles in one of Protomaps' flavours. */
const styleHandler = (flavor: "light" | "dark") => async (req: Request, res: Response) => {
  const header = await (await getArchive()).getHeader();
  res.set("Cache-Control", "public, max-age=3600").json({
    version: 8,
    name: flavor === "dark" ? "Knockd London (dark)" : "Knockd London",
    glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ASSETS}/sprites/v4/${flavor}`,
    sources: {
      protomaps: {
        type: "vector",
        tiles: [`${baseUrl(req)}/tiles/{z}/{x}/{y}.mvt`],
        minzoom: header.minZoom,
        maxzoom: header.maxZoom,
        bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
        attribution: ATTRIBUTION,
      },
    },
    layers: layers("protomaps", namedFlavor(flavor), { lang: "en" }),
  });
};

tilesRouter.get("/style.json", styleHandler("light"));
tilesRouter.get("/style-dark.json", styleHandler("dark"));

tilesRouter.get("/:z/:x/:file", async (req, res, next) => {
  const match = /^(\d+)\.mvt$/.exec(req.params.file);
  const z = Number(req.params.z);
  const x = Number(req.params.x);
  if (!match || !Number.isInteger(z) || !Number.isInteger(x)) return next();
  const tile = await (await getArchive()).getZxy(z, x, Number(match[1]));
  if (!tile) {
    res.status(204).end(); // outside London or empty: MapLibre treats 204 as "no data"
    return;
  }
  res
    .set("Content-Type", "application/vnd.mapbox-vector-tile")
    .set("Cache-Control", "public, max-age=86400")
    .send(Buffer.from(tile.data));
});
