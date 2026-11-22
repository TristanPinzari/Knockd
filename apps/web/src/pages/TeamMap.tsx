import { HIGHLIGHT_COLOURS } from "@knockd/shared";
import type {
  CreateHighlightBody,
  CreateTeamNoteBody,
  GetHighlightsRes,
  GetMapsRes,
  GetMeRes,
  GetTeamNotesRes,
  GetTeamSessionsRes,
  MapBlocksRes,
  MapLeadsRes,
  MapStatsRes,
  MapView as KnockdMap,
  TeamRes,
  TeamRole,
} from "@knockd/shared";
import type { FeatureCollection, Position } from "geojson";
import * as maplibregl from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api";
import { addDraftLayer, cleanRing, useDrawing, type DrawTool } from "../map/draw";
import { addLayers, COLOURS, setBlocks, setHighlights, setLeads, setNotes, setPaths } from "../map/layers";
import { useMap } from "../MapView";
import { ago, km, pct, shortDate, Stat, ThemeToggle } from "../ui";
import { MembersDialog } from "./MembersDialog";

/** Below this zoom (wider than a whole city) the map shows no team data. */
const MIN_DATA_ZOOM = 9;
const DAY = 86_400_000;

/** The team screen: the map is the stage, with a floating panel (maps, stats, sessions) and a time slider. */
export function TeamMap() {
  const { teamId = "", mapId } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const { map, styleKey, theme } = useMap(container);

  const [team, setTeam] = useState<TeamRes["team"] | null>(null);
  const [role, setRole] = useState<TeamRole>("viewer");
  const [maps, setMaps] = useState<KnockdMap[]>([]);
  const [sessions, setSessions] = useState<GetTeamSessionsRes["sessions"]>([]);
  const [stats, setStats] = useState<MapStatsRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomedOut, setZoomedOut] = useState(false);
  const [loadingLayers, setLoadingLayers] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  // Marking the map (owners and editors): a highlighter stroke, a loop around an area, or a note.
  const [tool, setTool] = useState<DrawTool | null>(null);
  const [colour, setColour] = useState<string>(HIGHLIGHT_COLOURS[0]);
  const [noteAt, setNoteAt] = useState<{ lat: number; lng: number } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  // Time slider: null = now. `slider` moves instantly; `asOf` follows it after a short pause.
  const [slider, setSlider] = useState<number | null>(null);
  const [asOf, setAsOf] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setAsOf(slider), 250);
    return () => clearTimeout(t);
  }, [slider]);

  const current = maps.find((m) => m.id === mapId) ?? null;
  const canEdit = role === "owner" || role === "editor";

  // ---------- Team, role, maps, sessions ----------
  useEffect(() => {
    Promise.all([
      api<TeamRes>(`/v1/teams/${teamId}`),
      api<GetMeRes>("/v1/me"),
      api<GetMapsRes>(`/v1/teams/${teamId}/maps`),
      api<GetTeamSessionsRes>(`/v1/teams/${teamId}/sessions`),
    ])
      .then(([t, me, m, s]) => {
        setTeam(t.team);
        setRole(me.teams.find((x) => x.id === teamId)?.role ?? "viewer");
        setMaps(m.maps);
        setSessions(s.sessions);
      })
      .catch((e: Error) => setError(e.message));
  }, [api, teamId]);

  // Open the first map if none is chosen.
  useEffect(() => {
    if (!mapId && maps[0]) navigate(`/teams/${teamId}/maps/${maps[0].id}`, { replace: true });
  }, [mapId, maps, navigate, teamId]);

  // ---------- Map stats (follow the time slider) ----------
  useEffect(() => {
    if (!current) return;
    const q = asOf ? `?to=${new Date(asOf).toISOString()}` : "";
    api<MapStatsRes>(`/v1/maps/${current.id}/stats${q}`)
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, [api, current, asOf]);

  // ---------- Layers ----------
  // Our layers go on top of the basemap. Loading a basemap (first load, switching light/dark)
  // removes them, so they're added in MapLibre's "style.load" event, when the basemap is ready.
  useEffect(() => {
    if (!map) return;
    const add = () => {
      if (!map.getSource("blocks")) addLayers(map, theme);
      addDraftLayer(map);
    };
    try {
      add();
    } catch {
      // The basemap is still loading: "style.load" below adds them.
    }
    map.on("style.load", add);
    return () => {
      map.off("style.load", add);
    };
  }, [map, theme]);

  // Zoom to the map's boundary when it changes (maps without one, e.g. "World", keep the view).
  useEffect(() => {
    if (!map || !current?.boundary) return;
    const coords: Position[] = (
      current.boundary.type === "Polygon" ? current.boundary.coordinates : current.boundary.coordinates.flat()
    ).flat();
    const lngs = coords.map((c) => c[0]!);
    const lats = coords.map((c) => c[1]!);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 40, bottom: 120, left: window.innerWidth > 720 ? 430 : 40, right: 40 }, maxZoom: 16 },
    );
  }, [map, current]);

  const requestId = useRef(0);
  const loadLayers = useCallback(async () => {
    if (!map || !team) return;
    if (map.getZoom() < MIN_DATA_ZOOM) {
      setZoomedOut(true);
      return;
    }
    setZoomedOut(false);
    const id = ++requestId.current;
    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(5)).join(",");
    const time = asOf ? `&asOf=${new Date(asOf).toISOString()}` : "";
    setLoadingLayers(true);
    const none: FeatureCollection = { type: "FeatureCollection", features: [] };
    try {
      // Highlights and notes belong to the team; session data (blocks, streets, leads) to a map.
      const [highlights, notes, paths, blocks, leads] = await Promise.all([
        api<GetHighlightsRes>(`/v1/teams/${teamId}/highlights?bbox=${bbox}`),
        api<GetTeamNotesRes>(`/v1/teams/${teamId}/notes?bbox=${bbox}`),
        current ? api<FeatureCollection>(`/v1/maps/${current.id}/paths?bbox=${bbox}${time}`) : none,
        current ? api<MapBlocksRes>(`/v1/maps/${current.id}/blocks?bbox=${bbox}${time}`) : { blocks: [] },
        current ? api<MapLeadsRes>(`/v1/maps/${current.id}/leads?bbox=${bbox}&grades=A,B${time}`) : { leads: [] },
      ]);
      if (id !== requestId.current) return; // a newer request is on its way
      setBlocks(map, blocks.blocks);
      setPaths(map, paths, team.fadeDays, asOf ?? Date.now());
      setLeads(map, leads.leads);
      setHighlights(map, highlights.highlights);
      setNotes(map, notes.notes);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setLoadingLayers(false);
    }
  }, [api, map, current, team, teamId, asOf]);

  useEffect(() => {
    if (!map) return;
    const first = setTimeout(loadLayers, 0); // load now, then on every pan and zoom
    map.on("moveend", loadLayers);
    return () => {
      clearTimeout(first);
      map.off("moveend", loadLayers);
    };
  }, [map, loadLayers, styleKey]);

  // ---------- Marking the map ----------
  const save = useCallback(
    async (path: string, body: CreateHighlightBody | CreateTeamNoteBody) => {
      setSaving(true);
      try {
        await api(path, { method: "POST", body: JSON.stringify(body) });
        await loadLayers();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [api, loadLayers],
  );
  useDrawing(map, tool, colour, {
    onLine: (coordinates) =>
      save(`/v1/teams/${teamId}/highlights`, {
        geometry: { type: "LineString", coordinates },
        colour: colour as CreateHighlightBody["colour"],
      }),
    onArea: (ring) =>
      save(`/v1/teams/${teamId}/highlights`, {
        geometry: { type: "Polygon", coordinates: [cleanRing(ring)] },
        colour: colour as CreateHighlightBody["colour"],
      }),
    onPoint: (at) => {
      setNoteAt(at);
      setNoteText("");
    },
  });
  const saveNote = async () => {
    if (!noteAt || !noteText.trim()) return;
    await save(`/v1/teams/${teamId}/notes`, { ...noteAt, text: noteText.trim() });
    setNoteAt(null);
    setNoteText("");
  };

  // A pin where the note will go.
  useEffect(() => {
    if (!map || !noteAt) return;
    const marker = new maplibregl.Marker({ color: "#e8007f" }).setLngLat([noteAt.lng, noteAt.lat]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, noteAt]);

  // Esc stops drawing.
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool(null);
      setNoteAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);

  // Popups need the latest of these without re-binding every click handler.
  const live = useRef({ tool, canEdit, api, loadLayers });
  useEffect(() => {
    live.current = { tool, canEdit, api, loadLayers };
  });

  // ---------- Popups ----------
  useEffect(() => {
    if (!map) return;
    const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "260px", offset: 8 });
    const show = (html: string) => (e: maplibregl.MapLayerMouseEvent) => {
      if (live.current.tool) return;
      const p = e.features?.[0]?.properties;
      if (p)
        popup
          .setLngLat(e.lngLat)
          .setHTML(html.replace(/\{(\w+)\}/g, (_, k) => escape(String(p[k] ?? ""))))
          .addTo(map);
    };
    /** A note or highlight: who made it, and Delete for owners and editors. */
    const marking = (e: maplibregl.MapLayerMouseEvent, kind: "notes" | "highlights") => {
      const p = e.features?.[0]?.properties;
      if (!p || live.current.tool) return;
      e.originalEvent.stopPropagation();
      const el = document.createElement("div");
      el.innerHTML =
        (kind === "notes" ? `<b>${escape(String(p.text ?? ""))}</b><br>` : "<b>Highlight</b><br>") +
        `<span style="color:var(--muted)">${escape(String(p.by ?? ""))} · ${ago(String(p.at))}</span>`;
      if (live.current.canEdit) {
        const del = document.createElement("button");
        del.className = "btn btn-secondary btn-sm";
        del.style.marginTop = "10px";
        del.textContent = "Delete";
        del.onclick = async () => {
          del.disabled = true;
          try {
            await live.current.api(`/v1/${kind}/${p.id}`, { method: "DELETE" });
            popup.remove();
            await live.current.loadLayers();
          } catch (err) {
            del.textContent = (err as Error).message;
          }
        };
        el.append(document.createElement("br"), del);
      }
      popup.setLngLat(e.lngLat).setDOMContent(el).addTo(map);
    };
    const handlers: [string, (e: maplibregl.MapLayerMouseEvent) => void][] = [
      [
        "blocks-fill",
        (e) => {
          const p = e.features?.[0]?.properties;
          if (!p || live.current.tool) return;
          const leads = JSON.parse(String(p.leads ?? "{}")) as { A: number; B: number; C: number };
          const rate = p.rate === null || p.rate === undefined || p.rate === "null" ? null : Number(p.rate);
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<b>Lead rate ${pct(rate)}</b><br>${p.housesWorked} houses worked<br>Leads: ${leads.A} A · ${leads.B} B · ${leads.C} C` +
                (p.lastWorkedAt && p.lastWorkedAt !== "null" ? `<br>Last worked ${ago(String(p.lastWorkedAt))}` : ""),
            )
            .addTo(map);
        },
      ],
      ["leads", show("<b>{grade} lead</b><br>{note}")],
      ["notes", (e) => marking(e, "notes")],
      ["highlights-line", (e) => marking(e, "highlights")],
      ["highlights-fill", (e) => marking(e, "highlights")],
      [
        "paths",
        (e) => {
          const p = e.features?.[0]?.properties;
          if (!p || live.current.tool) return;
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<b>${escape(String(p.memberName ?? ""))}</b><br>${Math.round(Number(p.durationS) / 60)} min · ${ago(String(p.workedAt))}`,
            )
            .addTo(map);
        },
      ],
    ];
    for (const [layer, fn] of handlers) {
      map.on("click", layer, fn);
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
    return () => {
      for (const [layer, fn] of handlers) map.off("click", layer, fn);
      popup.remove();
    };
  }, [map]);

  // ---------- Time slider range: from the first uploaded session to today ----------
  const [now] = useState(() => Date.now());
  const range = useMemo(() => {
    const first = sessions.length ? Math.min(...sessions.map((s) => Date.parse(s.startedAt))) : now - 90 * DAY;
    return { min: Math.floor(first / DAY) * DAY, max: now };
  }, [sessions, now]);

  const visibleSessions = sessions.filter((s) => asOf === null || Date.parse(s.startedAt) <= asOf).slice(0, 20);

  if (error && !team)
    return (
      <div className="page">
        <div className="container">
          <h2 style={{ marginBottom: 8 }}>Couldn&apos;t open this team</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            {error}
          </p>
          <Link to="/" className="btn btn-secondary">
            Back to your teams
          </Link>
        </div>
      </div>
    );

  return (
    <div className="map-screen">
      <div ref={container} className="map-canvas" />

      <div className="card panel">
        <div className="panel-head">
          <div className="row" style={{ marginBottom: 14 }}>
            <Link to="/" className="btn btn-secondary icon-btn" aria-label="Back to your teams">
              ←
            </Link>
            <div className="grow">
              <h2 className="ellipsis">{team?.name ?? "…"}</h2>
            </div>
            <ThemeToggle />
            <button className="btn btn-secondary btn-sm" onClick={() => setShowMembers(true)}>
              People
            </button>
          </div>
          {maps.length > 0 && (
            <div className="pills">
              {maps.map((m) => (
                <button
                  key={m.id}
                  className={`pill ${m.id === current?.id ? "on" : ""}`}
                  onClick={() => navigate(`/teams/${teamId}/maps/${m.id}`)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel-body">
          {maps.length === 0 && team && (
            <p className="muted" style={{ marginTop: 8 }}>
              No maps yet. Upload a session from the phone and it shows up here.
            </p>
          )}

          {stats && (
            <>
              <div className="section-title">
                {asOf ? `As of ${shortDate(new Date(asOf).toISOString())}` : "All time"}
              </div>
              <div className="stats">
                <Stat value={stats.housesWorked.toLocaleString()} label="Houses worked" />
                <Stat value={pct(stats.leadRate)} label="Lead rate (A + B)" />
                <Stat value={`${stats.leads.A} · ${stats.leads.B} · ${stats.leads.C}`} label="A · B · C leads" />
                <Stat value={km(stats.distanceM)} label={`Walked in ${stats.sessions} sessions`} />
              </div>
            </>
          )}

          {canEdit && (
            <>
              <div className="section-title">Mark the map</div>
              <div className="pills">
                {(
                  [
                    ["line", "Highlight a road"],
                    ["area", "Circle an area"],
                    ["note", "Add a note"],
                  ] as const
                ).map(([t, label]) => (
                  <button
                    key={t}
                    className={`pill ${tool === t ? "on" : ""}`}
                    onClick={() => {
                      setTool(tool === t ? null : t);
                      setNoteAt(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(tool === "line" || tool === "area") && (
                <>
                  <div className="row" style={{ margin: "12px 0 6px", gap: 8 }}>
                    {HIGHLIGHT_COLOURS.map((c) => (
                      <button
                        key={c}
                        aria-label={`Colour ${c}`}
                        onClick={() => setColour(c)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 99,
                          background: c,
                          border: 0,
                          cursor: "pointer",
                          boxShadow: colour === c ? "0 0 0 3px var(--surface), 0 0 0 5px var(--ink)" : "none",
                        }}
                      />
                    ))}
                  </div>
                  <p className="muted small">
                    {tool === "line" ? "Drag along the streets to highlight them." : "Drag a loop around the area."}{" "}
                    {saving ? "Saving…" : "Esc or the button again to stop."} Colours have no set meaning: your team
                    decides.
                  </p>
                </>
              )}
              {tool === "note" && !noteAt && (
                <p className="muted small" style={{ marginTop: 10 }}>
                  Click the map where the note goes.
                </p>
              )}
              {tool === "note" && noteAt && (
                <div style={{ marginTop: 10 }}>
                  <input
                    className="input"
                    autoFocus
                    maxLength={140}
                    placeholder="e.g. Gate code 1234, dog at #12"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveNote()}
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" disabled={!noteText.trim() || saving} onClick={saveNote}>
                      Save note
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setNoteAt(null)}>
                      Cancel
                    </button>
                    <span className="muted small grow" style={{ textAlign: "right" }}>
                      {noteText.length}/140
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="section-title">On the map</div>
          <div className="legend">
            <span>
              <i className="swatch" style={{ background: COLOURS.good }} />
              Best blocks
            </span>
            <span>
              <i className="swatch" style={{ background: COLOURS.mid }} />
              Average
            </span>
            <span>
              <i className="swatch" style={{ background: COLOURS.bad }} />
              No A/B leads
            </span>
            <span>
              <i className="swatch" style={{ background: COLOURS.none }} />
              Not enough data
            </span>
            <span>
              <i className="swatch" style={{ background: COLOURS.leadA, borderRadius: 99 }} />A lead
            </span>
            <span>
              <i className="swatch" style={{ background: COLOURS.leadB, borderRadius: 99 }} />B lead
            </span>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Lines are streets walked: stronger = longer and more recent. Colours compare blocks on screen.
          </p>

          <div className="section-title">Sessions</div>
          {visibleSessions.length === 0 && <p className="muted">No sessions uploaded yet.</p>}
          {visibleSessions.map((s) => (
            <div key={s.id} className="list-item">
              <div className="grow">
                <h3>{shortDate(s.startedAt)}</h3>
                <p className="muted small ellipsis">{s.memberNames.join(", ")}</p>
              </div>
              <div className="stack" style={{ alignItems: "flex-end", gap: 4 }}>
                <span className="small" style={{ fontWeight: 700 }}>
                  {s.housesCovered} houses
                </span>
                <span className="chip chip-accent">
                  {s.leads.A} A · {s.leads.B} B
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && team && (
        <div className="card toast" role="alert">
          <span className="grow small" style={{ fontWeight: 600 }}>
            {error}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {(zoomedOut || loadingLayers) && (
        <div className="card float-top-right" style={{ padding: "10px 16px", borderRadius: 999 }}>
          <span className="small" style={{ fontWeight: 600 }}>
            {zoomedOut ? "Zoom in to the city to see the team’s map" : "Loading…"}
          </span>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="card timebar">
          <span className="timebar-label">{slider === null ? "Today" : shortDate(new Date(slider).toISOString())}</span>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={DAY}
            value={slider ?? range.max}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSlider(v >= range.max - DAY / 2 ? null : v);
            }}
            aria-label="Show the map as of this date"
          />
          {slider !== null && (
            <button className="btn btn-secondary btn-sm" onClick={() => setSlider(null)}>
              Today
            </button>
          )}
        </div>
      )}

      {showMembers && team && <MembersDialog teamId={teamId} myRole={role} onClose={() => setShowMembers(false)} />}
    </div>
  );
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
