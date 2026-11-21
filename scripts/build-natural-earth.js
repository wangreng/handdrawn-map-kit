'use strict';
// Builds bundled Natural Earth datasets (public domain, https://www.naturalearthdata.com/)
// under data/:
//   - data/ne_50m_admin_0_countries.json      (1:50m Admin 0 – Countries)
//   - data/ne_admin_1_states_provinces.json.gz (1:10m Admin 1 – States & Provinces, simplified)
//   - data/ne_50m_rivers.json.gz              (1:50m Rivers + Lake Centerlines)
//   - data/ne_50m_lakes.json.gz               (1:50m Lakes + Reservoirs)
//   - data/ne_50m_populated_places.json.gz    (1:50m Populated Places)
//   - data/ne_50m_landforms.json.gz           (1:50m Geography Regions Polys + Elevation Points)
//
// Usage:
//   node scripts/build-natural-earth.js
//   node scripts/build-natural-earth.js path/to/admin0.geojson
//   node scripts/build-natural-earth.js --only=admin1,rivers,lakes,places,landforms
//   node scripts/build-natural-earth.js --only=admin1 --tol=0.025
//   node scripts/build-natural-earth.js --only=rivers --local rivers=path/to/rivers.geojson
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { fromGeoJSON } = require('../src/geo');

const VERSION = 'v5.1.2';
const BASE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${VERSION}/geojson`;
const DEFAULT_OUT_DIR = path.join(__dirname, '..', 'data');
const VALID_LAYERS = ['countries', 'admin1', 'rivers', 'lakes', 'places', 'landforms'];

const URLS = {
  countries: `${BASE_URL}/ne_50m_admin_0_countries.geojson`,
  admin1: `${BASE_URL}/ne_10m_admin_1_states_provinces.geojson`,
  rivers: `${BASE_URL}/ne_50m_rivers_lake_centerlines.geojson`,
  lakes: `${BASE_URL}/ne_50m_lakes.geojson`,
  places: `${BASE_URL}/ne_50m_populated_places.geojson`,
  landforms_polys: `${BASE_URL}/ne_50m_geography_regions_polys.geojson`,
  landforms_peaks: `${BASE_URL}/ne_50m_geography_regions_elevation_points.geojson`,
};

const LANDFORM_CLASSES = new Set([
  'Range/mtn',
  'Plateau',
  'Desert',
  'Plain',
  'Basin',
  'Valley',
  'Lowland',
  'Tundra',
  'Foothills',
  'Gorge',
]);

const valid = (v) => v != null && v !== '' && String(v) !== '-99';
const round = (v) => Math.round(v * 1000) / 1000;

function splitPipe(v) {
  if (!valid(v)) return [];
  return String(v)
    .split('|')
    .map((s) => s.trim())
    .filter(valid);
}

function uniqueNames(candidates, exclude = []) {
  const skip = new Set(exclude.filter(valid));
  const out = [];
  for (const raw of candidates) {
    for (const s of splitPipe(raw)) {
      if (!skip.has(s)) {
        skip.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

// Unwrap consecutive longitude jumps > 180° for antimeridian-safe simplification
function unwrapRing(pts) {
  if (!pts.length) return [];
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    let lon = pts[i][0];
    const prevLon = out[i - 1][0];
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    out.push([lon, pts[i][1]]);
  }
  return out;
}

function wrapLon(lon) {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

// cos(lat)-weighted squared perpendicular distance in degree space
function pointSegDist2Deg(p, a, b) {
  const midLat = ((a[1] + b[1]) * 0.5) * (Math.PI / 180);
  const cosLat = Math.max(0.05, Math.cos(midLat));
  const dx = (b[0] - a[0]) * cosLat;
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const px = (p[0] - a[0]) * cosLat;
  const py = p[1] - a[1];
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
  const ex = px - t * dx;
  const ey = py - t * dy;
  return ex * ex + ey * ey;
}

// Iterative Douglas-Peucker on a closed geographic ring (without closing vertex)
function simplifyGeoRing(rawRing, tolDeg) {
  if (!rawRing || rawRing.length < 3) return [];
  const last = rawRing[rawRing.length - 1];
  const open = (rawRing.length > 1 && rawRing[0][0] === last[0] && rawRing[0][1] === last[1])
    ? rawRing.slice(0, -1)
    : rawRing.slice();
  const n = open.length;
  if (n < 3) return [];
  if (!(tolDeg > 0) || n <= 4) {
    return open.map(([lon, lat]) => [round(lon), round(lat)]);
  }

  const pts = unwrapRing(open);
  // Split closed ring at vertex farthest from pts[0]
  let far = 1;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const midLat = ((pts[0][1] + pts[i][1]) * 0.5) * (Math.PI / 180);
    const cosLat = Math.max(0.05, Math.cos(midLat));
    const dx = (pts[i][0] - pts[0][0]) * cosLat;
    const dy = pts[i][1] - pts[0][1];
    const d = dx * dx + dy * dy;
    if (d > farD) { farD = d; far = i; }
  }

  const keep = new Uint8Array(n + 1);
  keep[0] = 1;
  keep[far] = 1;
  keep[n] = 1;
  const tol2 = tolDeg * tolDeg;
  const at = (i) => pts[i % n];
  const stack = [[0, far], [far, n]];

  while (stack.length) {
    const [i0, i1] = stack.pop();
    const a = at(i0);
    const b = at(i1);
    let worst = -1;
    let worstD = tol2;
    for (let i = i0 + 1; i < i1; i++) {
      const d = pointSegDist2Deg(at(i), a, b);
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([i0, worst], [worst, i1]);
    }
  }

  const simplified = [];
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const pt = [round(wrapLon(pts[i][0])), round(pts[i][1])];
    const prev = simplified[simplified.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) {
      simplified.push(pt);
    }
  }
  if (simplified.length > 1) {
    const first = simplified[0];
    const end = simplified[simplified.length - 1];
    if (first[0] === end[0] && first[1] === end[1]) simplified.pop();
  }
  return simplified;
}

function fallbackTriangle(rawRing) {
  const last = rawRing[rawRing.length - 1];
  const open = (rawRing.length > 1 && rawRing[0][0] === last[0] && rawRing[0][1] === last[1])
    ? rawRing.slice(0, -1)
    : rawRing.slice();
  if (open.length < 3) return [];
  const a = open[0];
  let farIdx = 1;
  let farD = -1;
  for (let i = 1; i < open.length; i++) {
    const d = (open[i][0] - a[0]) ** 2 + (open[i][1] - a[1]) ** 2;
    if (d > farD) { farD = d; farIdx = i; }
  }
  const b = open[farIdx];
  let thirdIdx = -1;
  let thirdD = -1;
  for (let i = 1; i < open.length; i++) {
    if (i === farIdx) continue;
    const d = pointSegDist2Deg(open[i], a, b);
    if (d > thirdD) { thirdD = d; thirdIdx = i; }
  }
  if (thirdIdx < 0) return [];
  const indices = [0, farIdx, thirdIdx].sort((x, y) => x - y);
  return indices.map((idx) => [round(open[idx][0]), round(open[idx][1])]);
}

function flattenRing(ring) {
  const out = new Array(ring.length * 2);
  for (let i = 0; i < ring.length; i++) {
    out[2 * i] = ring[i][0];
    out[2 * i + 1] = ring[i][1];
  }
  return out;
}

function cleanPolygonRings(polys, tolDeg) {
  const out = [];
  for (const poly of polys) {
    if (!poly || !poly.length) continue;
    const outer = tolDeg > 0
      ? simplifyGeoRing(poly[0], tolDeg)
      : simplifyGeoRing(poly[0], 0);
    if (outer.length < 3) continue;
    const rings = [flattenRing(outer)];
    for (let k = 1; k < poly.length; k++) {
      const hole = tolDeg > 0
        ? simplifyGeoRing(poly[k], tolDeg)
        : simplifyGeoRing(poly[k], 0);
      if (hole.length >= 3) rings.push(flattenRing(hole));
    }
    out.push(rings);
  }
  if (!out.length && polys.length) {
    // Preserve at least a 3-vertex outer ring for single/tiny features
    for (const poly of polys) {
      if (!poly || !poly.length) continue;
      const tri = fallbackTriangle(poly[0]);
      if (tri.length >= 3) {
        out.push([flattenRing(tri)]);
        break;
      }
    }
  }
  return out;
}

function cleanLine(coords) {
  const pts = [];
  for (const [lon, lat] of coords || []) {
    const pt = [round(lon), round(lat)];
    const prev = pts[pts.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) pts.push(pt);
  }
  return pts.length >= 2 ? flattenRing(pts) : null;
}

async function loadSource(layerKey, localMap) {
  if (localMap[layerKey]) {
    return JSON.parse(fs.readFileSync(localMap[layerKey], 'utf8'));
  }
  const url = URLS[layerKey];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return res.json();
}

function writeGzipJson(outPath, payload, label, count, countLabel) {
  const json = JSON.stringify(payload);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, gz);
  console.log(
    `Wrote ${outPath}: ${count} ${countLabel}, raw ${(json.length / 1e6).toFixed(2)} MB -> gz ${(gz.length / 1e6).toFixed(2)} MB`,
  );
  return { outPath, count, rawBytes: json.length, gzBytes: gz.length, label };
}

function buildCountriesData(geojson) {
  const countries = fromGeoJSON(geojson).countries
    .map((c) => ({
      ...c,
      polygons: c.polygons.map((poly) => poly.map((ring) => ring.flatMap(([lon, lat]) => [round(lon), round(lat)]))),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const head = {
    source: `Natural Earth 1:50m Admin 0 - Countries ${VERSION} (naturalearthdata.com)`,
    license: 'Public domain',
    url: URLS.countries,
    flat: true,
  };
  const body = countries.map((c) => '    ' + JSON.stringify(c)).join(',\n');
  const json = `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "countries": [\n${body}\n  ]\n}\n`;
  return { countries, json };
}

function buildAdmin1Data(geojson, tolDeg = 0.025) {
  const usedIds = new Set();
  const regions = [];
  for (const f of geojson.features || []) {
    const p = f.properties || {};
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    if (!valid(p.name) || !valid(p.adm0_a3)) continue;

    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const cleaned = cleanPolygonRings(polys, tolDeg);
    if (!cleaned.length) continue;

    const iso = valid(p.iso_3166_2) ? String(p.iso_3166_2).trim() : null;
    const adm1Code = valid(p.adm1_code) ? String(p.adm1_code).trim() : null;
    let id = null;
    if (iso && !iso.endsWith('~') && !usedIds.has(iso)) {
      id = iso;
    } else if (adm1Code && !usedIds.has(adm1Code)) {
      id = adm1Code;
    } else {
      id = `${String(p.adm0_a3).toUpperCase()}-${regions.length + 1}`;
    }
    usedIds.add(id);

    const name = String(p.name).trim();
    const zh = valid(p.name_zh) ? String(p.name_zh).trim() : null;
    const names = uniqueNames([p.name_en, p.name_local, p.name_alt], [name, zh]);
    const rec = {
      id,
      adm0: String(p.adm0_a3).toUpperCase(),
      name,
    };
    if (iso && iso !== id) rec.iso = iso;
    if (names.length) rec.names = names;
    if (zh) rec.zh = zh;
    if (valid(p.region)) rec.region = String(p.region).trim();
    if (valid(p.type_en)) rec.type = String(p.type_en).trim();
    rec.polygons = cleaned;
    regions.push(rec);
  }
  regions.sort((a, b) => (a.adm0 < b.adm0 ? -1 : a.adm0 > b.adm0 ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    source: `Natural Earth 1:10m Admin 1 - States, Provinces ${VERSION} (simplified ${tolDeg} deg)`,
    license: 'Public domain',
    url: URLS.admin1,
    flat: true,
    regions,
  };
}

function buildRiversData(geojson) {
  const rivers = [];
  for (const f of geojson.features || []) {
    const p = f.properties || {};
    const g = f.geometry;
    if (!g || (g.type !== 'LineString' && g.type !== 'MultiLineString')) continue;
    const rawLines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    const lines = rawLines.map(cleanLine).filter(Boolean);
    if (!lines.length) continue;

    const name = valid(p.name) ? String(p.name).trim() : null;
    const names = uniqueNames([p.name_en, p.name_alt], [name]);
    const rec = {
      name,
      ...(names.length ? { names } : {}),
      kind: valid(p.featurecla) ? String(p.featurecla).trim() : 'River',
      rank: Number.isFinite(p.scalerank) ? p.scalerank : 6,
      lines,
    };
    rivers.push(rec);
  }
  rivers.sort((a, b) => (
    a.rank - b.rank
    || (a.name || '').localeCompare(b.name || '')
    || (a.lines[0][0] - b.lines[0][0])
  ));
  return {
    source: `Natural Earth 1:50m Rivers + lake centerlines ${VERSION}`,
    license: 'Public domain',
    url: URLS.rivers,
    flat: true,
    rivers,
  };
}

function buildLakesData(geojson) {
  const lakes = [];
  for (const f of geojson.features || []) {
    const p = f.properties || {};
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const cleaned = cleanPolygonRings(polys, 0);
    if (!cleaned.length) continue;

    const name = valid(p.name) ? String(p.name).trim() : null;
    const zh = valid(p.name_zh) ? String(p.name_zh).trim() : null;
    const names = uniqueNames([p.name_en, p.name_ja, p.name_ko, p.name_alt], [name, zh]);
    const rec = {
      name,
      ...(names.length ? { names } : {}),
      ...(zh ? { zh } : {}),
      kind: valid(p.featurecla) ? String(p.featurecla).trim() : 'Lake',
      rank: Number.isFinite(p.scalerank) ? p.scalerank : 6,
      polygons: cleaned,
    };
    lakes.push(rec);
  }
  lakes.sort((a, b) => (
    a.rank - b.rank
    || (a.name || '').localeCompare(b.name || '')
    || (a.polygons[0][0][0] - b.polygons[0][0][0])
  ));
  return {
    source: `Natural Earth 1:50m Lakes + Reservoirs ${VERSION}`,
    license: 'Public domain',
    url: URLS.lakes,
    flat: true,
    lakes,
  };
}

function buildPlacesData(geojson) {
  const places = [];
  for (const f of geojson.features || []) {
    const p = f.properties || {};
    const g = f.geometry;
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) continue;
    if (!valid(p.NAME)) continue;

    const name = String(p.NAME).trim();
    const ascii = valid(p.NAMEASCII) ? String(p.NAMEASCII).trim() : null;
    const zh = valid(p.NAME_ZH) ? String(p.NAME_ZH).trim() : null;
    const ja = valid(p.NAME_JA) ? String(p.NAME_JA).trim() : null;
    const ko = valid(p.NAME_KO) ? String(p.NAME_KO).trim() : null;
    const names = uniqueNames([p.NAME_EN, p.NAMEALT], [name, ascii, zh, ja, ko]);
    const capital = p.ADM0CAP === 1;
    const adm1Capital = /Admin-1.*capital/i.test(String(p.FEATURECLA || ''));
    const rec = {
      name,
      ...(ascii && ascii !== name ? { ascii } : {}),
      ...(names.length ? { names } : {}),
      ...(zh ? { zh } : {}),
      ...(ja ? { ja } : {}),
      ...(ko ? { ko } : {}),
      adm0: valid(p.ADM0_A3) ? String(p.ADM0_A3).toUpperCase() : null,
      ...(valid(p.ADM1NAME) ? { adm1: String(p.ADM1NAME).trim() } : {}),
      ...(capital ? { capital: true } : {}),
      ...(adm1Capital ? { adm1Capital: true } : {}),
      pop: Number.isFinite(p.POP_MAX) && p.POP_MAX > 0 ? Math.round(p.POP_MAX) : 0,
      rank: Number.isFinite(p.SCALERANK) ? p.SCALERANK : 10,
      lon: round(g.coordinates[0]),
      lat: round(g.coordinates[1]),
    };
    places.push(rec);
  }
  places.sort((a, b) => (
    (b.capital ? 1 : 0) - (a.capital ? 1 : 0)
    || b.pop - a.pop
    || a.name.localeCompare(b.name)
  ));
  return {
    source: `Natural Earth 1:50m Populated Places ${VERSION}`,
    license: 'Public domain',
    url: URLS.places,
    places,
  };
}

function buildLandformsData(polysGeojson, peaksGeojson) {
  const peaks = [];
  for (const f of peaksGeojson.features || []) {
    const p = f.properties || {};
    const g = f.geometry;
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) continue;
    const name = valid(p.name_en) ? String(p.name_en).trim() : (valid(p.name) ? String(p.name).trim() : null);
    if (!name) continue;
    const zh = valid(p.name_zh) ? String(p.name_zh).trim() : null;
    const names = uniqueNames([p.name, p.name_alt], [name, zh]);
    peaks.push({
      name,
      ...(names.length ? { names } : {}),
      ...(zh ? { zh } : {}),
      kind: valid(p.featurecla) ? String(p.featurecla).trim() : 'mountain',
      elevation: Number.isFinite(p.elevation) ? Math.round(p.elevation) : null,
      ...(valid(p.region) ? { region: String(p.region).trim() } : {}),
      rank: Number.isFinite(p.scalerank) ? p.scalerank : 6,
      lon: round(g.coordinates[0]),
      lat: round(g.coordinates[1]),
    });
  }
  peaks.sort((a, b) => ((b.elevation ?? -Infinity) - (a.elevation ?? -Infinity)) || a.name.localeCompare(b.name));

  const regions = [];
  for (const f of polysGeojson.features || []) {
    const p = f.properties || {};
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const kind = valid(p.FEATURECLA) ? String(p.FEATURECLA).trim() : null;
    if (!kind || !LANDFORM_CLASSES.has(kind)) continue;
    const name = valid(p.NAME_EN) ? String(p.NAME_EN).trim() : (valid(p.NAME) ? String(p.NAME).trim() : null);
    if (!name) continue;

    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const cleaned = cleanPolygonRings(polys, 0);
    if (!cleaned.length) continue;

    const zh = valid(p.NAME_ZH) ? String(p.NAME_ZH).trim() : null;
    const names = uniqueNames([p.NAME, p.NAMEALT], [name, zh]);
    regions.push({
      name,
      ...(names.length ? { names } : {}),
      ...(zh ? { zh } : {}),
      kind,
      ...(valid(p.REGION) ? { region: String(p.REGION).trim() } : {}),
      rank: Number.isFinite(p.SCALERANK) ? p.SCALERANK : 6,
      polygons: cleaned,
    });
  }
  regions.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  return {
    source: `Natural Earth 1:50m Geography Regions (Polys + Elevation Points) ${VERSION}`,
    license: 'Public domain',
    urls: [URLS.landforms_polys, URLS.landforms_peaks],
    flat: true,
    peaks,
    regions,
  };
}

function parseArgs(argv) {
  let only = null;
  let tol = 0.025;
  let outDir = DEFAULT_OUT_DIR;
  const local = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--only=')) {
      only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--only') {
      only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--tol=')) {
      tol = Number(arg.slice('--tol='.length));
    } else if (arg === '--tol') {
      tol = Number(argv[++i]);
    } else if (arg.startsWith('--out-dir=')) {
      outDir = arg.slice('--out-dir='.length);
    } else if (arg === '--out-dir') {
      outDir = argv[++i];
    } else if (arg.startsWith('--local=')) {
      const pair = arg.slice('--local='.length);
      const eq = pair.indexOf('=');
      if (eq <= 0) throw new Error(`Invalid --local argument "${pair}": expected <layer>=<path>`);
      local[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (arg === '--local') {
      const pair = argv[++i] || '';
      const eq = pair.indexOf('=');
      if (eq <= 0) throw new Error(`Invalid --local argument "${pair}": expected <layer>=<path>`);
      local[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  // Backward compatibility: single positional path rebuilds countries only
  if (positional.length === 1 && !only && !Object.keys(local).length) {
    only = ['countries'];
    local.countries = positional[0];
  } else if (positional.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positional.join(' ')}`);
  }

  const layers = only || VALID_LAYERS.slice();
  for (const layer of layers) {
    if (!VALID_LAYERS.includes(layer)) {
      throw new Error(`Unknown layer "${layer}". Valid layers: ${VALID_LAYERS.join(', ')}`);
    }
  }
  if (!Number.isFinite(tol) || tol < 0) {
    throw new Error(`Invalid --tol value: ${tol}`);
  }
  return { layers, tol, outDir, local };
}

async function runBuild(argv = process.argv.slice(2)) {
  const { layers, tol, outDir, local } = parseArgs(argv);
  const results = [];

  for (const layer of layers) {
    if (layer === 'countries') {
      const geojson = await loadSource('countries', local);
      const { countries, json } = buildCountriesData(geojson);
      const outPath = path.join(outDir, 'ne_50m_admin_0_countries.json');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, json);
      console.log(`Wrote ${outPath}: ${countries.length} countries, ${(json.length / 1e6).toFixed(2)} MB`);
      results.push({ layer, outPath, count: countries.length, rawBytes: json.length });
    } else if (layer === 'admin1') {
      const geojson = await loadSource('admin1', local);
      const payload = buildAdmin1Data(geojson, tol);
      results.push(writeGzipJson(
        path.join(outDir, 'ne_admin_1_states_provinces.json.gz'),
        payload,
        'admin1',
        payload.regions.length,
        'admin-1 regions',
      ));
    } else if (layer === 'rivers') {
      const geojson = await loadSource('rivers', local);
      const payload = buildRiversData(geojson);
      results.push(writeGzipJson(
        path.join(outDir, 'ne_50m_rivers.json.gz'),
        payload,
        'rivers',
        payload.rivers.length,
        'rivers',
      ));
    } else if (layer === 'lakes') {
      const geojson = await loadSource('lakes', local);
      const payload = buildLakesData(geojson);
      results.push(writeGzipJson(
        path.join(outDir, 'ne_50m_lakes.json.gz'),
        payload,
        'lakes',
        payload.lakes.length,
        'lakes',
      ));
    } else if (layer === 'places') {
      const geojson = await loadSource('places', local);
      const payload = buildPlacesData(geojson);
      results.push(writeGzipJson(
        path.join(outDir, 'ne_50m_populated_places.json.gz'),
        payload,
        'places',
        payload.places.length,
        'populated places',
      ));
    } else if (layer === 'landforms') {
      const polysGeojson = await loadSource('landforms_polys', local);
      const peaksGeojson = await loadSource('landforms_peaks', local);
      const payload = buildLandformsData(polysGeojson, peaksGeojson);
      results.push(writeGzipJson(
        path.join(outDir, 'ne_50m_landforms.json.gz'),
        payload,
        'landforms',
        payload.peaks.length + payload.regions.length,
        `landforms (${payload.peaks.length} peaks, ${payload.regions.length} regions)`,
      ));
    }
  }
  return results;
}

if (require.main === module) {
  runBuild().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runBuild,
  simplifyGeoRing,
  buildAdmin1Data,
  buildRiversData,
  buildLakesData,
  buildPlacesData,
  buildLandformsData,
  buildCountriesData,
  LANDFORM_CLASSES,
  VALID_LAYERS,
};
