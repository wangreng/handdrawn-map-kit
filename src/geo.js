'use strict';
// Geographic data from Natural Earth (public domain, https://www.naturalearthdata.com/).
// Bundled datasets:
//   - 1:50m Admin 0 – Countries (`data/ne_50m_admin_0_countries.json`)
//   - 1:10m Admin 1 – States & Provinces, simplified (`data/ne_admin_1_states_provinces.json.gz`)
//   - 1:50m Rivers & Lake Centerlines (`data/ne_50m_rivers.json.gz`)
//   - 1:50m Lakes & Reservoirs (`data/ne_50m_lakes.json.gz`)
//   - 1:50m Populated Places (`data/ne_50m_populated_places.json.gz`)
//   - 1:50m Geography Regions & Elevation Points (`data/ne_50m_landforms.json.gz`)
// All layers are loaded lazily on first use and cached per source.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BUNDLED = path.join(DATA_DIR, 'ne_50m_admin_0_countries.json');
const BUNDLED_ADMIN1 = path.join(DATA_DIR, 'ne_admin_1_states_provinces.json.gz');
const BUNDLED_RIVERS = path.join(DATA_DIR, 'ne_50m_rivers.json.gz');
const BUNDLED_LAKES = path.join(DATA_DIR, 'ne_50m_lakes.json.gz');
const BUNDLED_PLACES = path.join(DATA_DIR, 'ne_50m_populated_places.json.gz');
const BUNDLED_LANDFORMS = path.join(DATA_DIR, 'ne_50m_landforms.json.gz');

const caches = {
  countries: new Map(),
  admin1: new Map(),
  rivers: new Map(),
  lakes: new Map(),
  places: new Map(),
  landforms: new Map(),
};

// Unicode/CJK-safe normalization:
// NFKC folds fullwidth punctuation/alphanumerics, NFD + [\u0300-\u036f] strips Latin combining
// diacritics without removing Japanese dakuten/handakuten, and NFC recomposes Korean Hangul.
const norm = (s) => {
  if (typeof s !== 'string' && !(typeof s === 'number' && Number.isFinite(s))) return '';
  return String(s)
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
};

const CJK_SUFFIX_RE = /(?:维吾尔自治区|回族自治区|壮族自治区|特别行政区|自治区|특별자치시|특별자치도|특별시|광역시|[省市县区都府県도시])$/;
const HAS_CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function stripCjkSuffix(k) {
  if (!k) return '';
  const stripped = k.replace(CJK_SUFFIX_RE, '');
  return stripped.length >= 2 && stripped !== k ? stripped : '';
}

const fmtId = (v) => {
  if (typeof v === 'symbol') return v.toString();
  try { return String(v); } catch {
    try { return Object.prototype.toString.call(v); } catch { return '[object]'; }
  }
};

const minSuggestionLen = (q) => (HAS_CJK_RE.test(q) ? 2 : 3);
const finiteNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const valid = (v) => (
  (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))
  && v !== ''
  && String(v) !== '-99'
);

function readJsonFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const isGz = filePath.endsWith('.gz') || (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b);
  const text = isGz ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return JSON.parse(text);
}

const isDatasetObject = (v) => (
  Boolean(v._kind)
  || v.type === 'FeatureCollection'
  || Array.isArray(v.rivers)
  || Array.isArray(v.lakes)
  || Array.isArray(v.countries)
  || Array.isArray(v.regions)
  || Array.isArray(v.places)
  || Array.isArray(v.peaks)
);

const extractSource = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && !isDatasetObject(v)) {
    if (Object.prototype.hasOwnProperty.call(v, 'source')) return v.source;
    if (Object.keys(v).length === 0) return undefined;
  }
  return v;
};

// Natural Earth GeoJSON FeatureCollection -> { countries: [{ id, name, names, iso2, continent, polygons }] }
function fromGeoJSON(geojson) {
  const countries = [];
  for (const f of geojson.features || []) {
    if (!f || typeof f !== 'object') continue;
    const p = f.properties || {};
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const id = [p.ADM0_A3, p.ISO_A3_EH, p.ISO_A3, p.SOV_A3].find(valid);
    const name = [p.NAME, p.ADMIN, p.NAME_LONG].find(valid);
    if (!id || !name) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const names = [...new Set([p.ADMIN, p.NAME_LONG, p.BRK_NAME, p.FORMAL_EN].filter((n) => valid(n) && n !== name))];
    // Natural Earth's own code can differ from ISO 3166 (South Sudan is SDS / SSD)
    const codes = [...new Set([p.ISO_A3_EH, p.ISO_A3].filter((c) => valid(c) && String(c).toUpperCase() !== String(id).toUpperCase()))];
    countries.push({
      id: String(id).toUpperCase(),
      name,
      names,
      ...(codes.length ? { codes } : {}),
      iso2: [p.ISO_A2_EH, p.ISO_A2].find((v) => valid(v) && String(v).length === 2) || null,
      continent: valid(p.CONTINENT) ? p.CONTINENT : null,
      // GeoJSON rings repeat their first point at the end; drop it
      polygons: polys.map((poly) => poly.map((ring) => ring.slice(0, -1).map(([lon, lat]) => [lon, lat]))),
    });
  }
  return { source: geojson.name || 'GeoJSON', countries };
}

function unflatten(ring) {
  const out = new Array(ring.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = [ring[2 * i], ring[2 * i + 1]];
  return out;
}

function ringArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    if (!Array.isArray(p) || !Array.isArray(q)) continue;
    const px = p[0], py = p[1], qx = q[0], qy = q[1];
    if (
      typeof px !== 'number' || !Number.isFinite(px)
      || typeof py !== 'number' || !Number.isFinite(py)
      || typeof qx !== 'number' || !Number.isFinite(qx)
      || typeof qy !== 'number' || !Number.isFinite(qy)
    ) continue;
    a += px * qy - qx * py;
  }
  return Math.abs(a) / 2;
}

// [west, south, east, north] of a list of polygons (outer rings only)
function bboxOf(polygons) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  if (!Array.isArray(polygons)) return [w, s, e, n];
  for (const poly of polygons) {
    if (!Array.isArray(poly) || !Array.isArray(poly[0])) continue;
    for (const pt of poly[0]) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const [lon, lat] = pt;
      if (typeof lon !== 'number' || !Number.isFinite(lon)) continue;
      if (typeof lat !== 'number' || !Number.isFinite(lat)) continue;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return [w, s, e, n];
}

function bboxOfLines(lines) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const line of lines) {
    for (const [lon, lat] of line) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return [w, s, e, n];
}

// Bounding box of the "home" territory: the largest polygon plus everything near it.
// Leaves out far-flung parts (French Guiana, Alaska & Hawaii, Okinawa, Svalbard ...) so a map
// fitted to it is not mostly ocean.
function mainBBoxOf(polygons) {
  if (!Array.isArray(polygons) || !polygons.length) return [Infinity, Infinity, -Infinity, -Infinity];
  const validPolys = polygons.filter((poly) => Array.isArray(poly) && Array.isArray(poly[0]) && poly[0].length > 0);
  if (!validPolys.length) return [Infinity, Infinity, -Infinity, -Infinity];
  let big = validPolys[0], bigArea = -1;
  for (const poly of validPolys) {
    const a = ringArea(poly[0]);
    if (a > bigArea) { bigArea = a; big = poly; }
  }
  const [w, s, e, n] = bboxOf([big]);
  if (!Number.isFinite(w)) return [Infinity, Infinity, -Infinity, -Infinity];
  const mx = Math.min(8, (e - w) * 0.5), my = Math.min(8, (n - s) * 0.5);
  const near = validPolys.filter((poly) => {
    const [pw, ps, pe, pn] = bboxOf([poly]);
    if (!Number.isFinite(pw)) return false;
    const cx = (pw + pe) / 2, cy = (ps + pn) / 2;
    return cx >= w - mx && cx <= e + mx && cy >= s - my && cy <= n + my;
  });
  return bboxOf(near);
}

const bboxIntersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

function isValidBBox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return false;
  const [w, s, e, n] = bbox;
  return (
    typeof w === 'number' && Number.isFinite(w)
    && typeof s === 'number' && Number.isFinite(s)
    && typeof e === 'number' && Number.isFinite(e)
    && typeof n === 'number' && Number.isFinite(n)
    && s <= n
  );
}

function shiftedBBoxes(bbox) {
  if (!isValidBBox(bbox)) return [];
  const [w, s, e, n] = bbox;
  // Support both extended [170, -25, 190, -10] and wrapped [170, -25, -170, -10] antimeridian boxes
  const eNorm = w > e ? e + 360 : e;
  return [-360, 0, 360].map((d) => [w + d, s, eNorm + d, n]);
}

function bboxTouches(featureBBox, queryBoxes) {
  return queryBoxes.some((box) => bboxIntersects(featureBBox, box));
}

function pointInBBox(lon, lat, queryBoxes) {
  return queryBoxes.some((box) => lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3]);
}

// =========================================================================
// 1. Admin 0 — Countries (preserved 100% backward compatible)
// =========================================================================
function indexCountries(raw, label) {
  const byKey = new Map();
  const countries = raw.countries.map((c) => {
    const polygons = raw.flat ? c.polygons.map((poly) => poly.map(unflatten)) : c.polygons;
    const country = {
      id: c.id,
      name: c.name,
      iso2: c.iso2 || null,
      continent: c.continent || null,
      polygons,
      bbox: bboxOf(polygons),
      mainBBox: mainBBoxOf(polygons),
    };
    return { country, keys: [[c.id], [c.name], c.codes || [], c.names || [], c.iso2 ? [c.iso2] : []] };
  });
  // Primary codes win over names, names over alternative codes and aliases, two-letter codes come last
  for (let tier = 0; tier < 5; tier++) {
    for (const { country, keys } of countries) {
      for (const key of keys[tier]) {
        const k = norm(key);
        if (k && !byKey.has(k)) byKey.set(k, country);
      }
    }
  }
  return { _kind: 'countries', source: raw.source || label, countries: countries.map((c) => c.country), byKey };
}

// Load a country dataset. `source` may be omitted (bundled Natural Earth 1:50m), a path to a
// Natural Earth countries GeoJSON / a file written by scripts/build-natural-earth.js, or an
// already parsed object of either kind.
function loadCountries(source) {
  if (source && source.byKey) return source;
  const key = source ?? BUNDLED;
  if (caches.countries.has(key)) return caches.countries.get(key);
  const raw = typeof key === 'string' ? readJsonFile(key) : key;
  const data = raw.type === 'FeatureCollection' ? fromGeoJSON(raw) : raw;
  if (!Array.isArray(data.countries)) throw new Error('Not a Natural Earth countries dataset');
  const ds = indexCountries(data, typeof key === 'string' ? path.basename(key) : 'custom');
  caches.countries.set(key, ds);
  return ds;
}

function findCountry(id, source) {
  return loadCountries(source).byKey.get(norm(id)) || null;
}

// Look a country up by ISO / Natural Earth three-letter code ('KOR'), two-letter code ('KR')
// or English name ('South Korea'). Throws with suggestions when nothing matches.
function getCountry(id, source) {
  if (id && typeof id === 'object' && Array.isArray(id.polygons)) return id;
  const ds = loadCountries(source);
  const hit = ds.byKey.get(norm(id));
  if (hit) return hit;
  const q = norm(id);
  const minLen = minSuggestionLen(q);
  const near = ds.countries
    .filter((c) => q.length >= minLen && (norm(c.name).includes(q) || q.includes(norm(c.name))))
    .slice(0, 5)
    .map((c) => `${c.name} (${c.id})`);
  throw new Error(`Unknown country "${fmtId(id)}"${near.length ? ` — did you mean ${near.join(', ')}?` : ''}`);
}

function listCountries(source) {
  return loadCountries(source).countries.map(({ id, name, iso2, continent }) => ({ id, name, iso2, continent }));
}

// All countries with at least one polygon whose bounding box touches [west, south, east, north].
// The box may run past +/-180 (a frame spanning the antimeridian); countries are matched a turn either side.
function countriesInBBox(bbox, source) {
  const boxes = shiftedBBoxes(bbox);
  if (!boxes.length) return [];
  return loadCountries(source).countries.filter(
    (c) => bboxTouches(c.bbox, boxes) && c.polygons.some((poly) => bboxTouches(bboxOf([poly]), boxes)),
  );
}

function resolveCountryCode(countryId, countrySource) {
  if (!countryId) return null;
  if (typeof countryId === 'object') {
    if (typeof countryId.id === 'string') {
      const trimmed = countryId.id.trim();
      return trimmed ? trimmed.toUpperCase() : null;
    }
    return null;
  }
  if (typeof countryId !== 'string') return null;
  const c = findCountry(countryId, countrySource);
  if (c) return c.id;
  const trimmed = countryId.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

// =========================================================================
// 2. Admin 1 — States, Provinces, Regions
// =========================================================================
function indexAdmin1(raw, label) {
  const byCountry = new Map();
  const groupBuckets = new Map(); // `${adm0}\0${norm(region)}` -> { adm0, region, parts }

  const entries = raw.regions.map((r) => {
    const polygons = raw.flat ? r.polygons.map((poly) => poly.map(unflatten)) : r.polygons;
    const item = {
      id: r.id,
      iso: r.iso || null,
      adm0: r.adm0,
      name: r.name,
      names: r.names || [],
      zh: r.zh || null,
      local: r.local || null,
      region: r.region || null,
      type: r.type || null,
      polygons,
      bbox: bboxOf(polygons),
      mainBBox: mainBBoxOf(polygons),
    };
    if (!byCountry.has(item.adm0)) byCountry.set(item.adm0, []);
    byCountry.get(item.adm0).push(item);

    if (item.region) {
      const rk = norm(item.region);
      if (rk) {
        const gk = `${item.adm0}\0${rk}`;
        if (!groupBuckets.has(gk)) groupBuckets.set(gk, { adm0: item.adm0, region: item.region, rk, parts: [] });
        groupBuckets.get(gk).parts.push(item);
      }
    }

    const stripped = [];
    for (const s of [item.zh, item.local, ...item.names]) {
      const sk = stripCjkSuffix(norm(s));
      if (sk) stripped.push(sk);
    }
    const keys = [
      [item.id],
      [item.name],
      [item.zh, item.local, item.iso].filter(Boolean),
      item.names,
      stripped,
    ];
    return { item, keys };
  });

  const byPrimaryKey = new Map();
  const byCountryPrimaryKey = new Map();
  const byAliasKey = new Map();
  const byCountryAliasKey = new Map();

  for (let tier = 0; tier < 5; tier++) {
    const globalMap = tier <= 2 ? byPrimaryKey : byAliasKey;
    const countryMaps = tier <= 2 ? byCountryPrimaryKey : byCountryAliasKey;
    for (const { item, keys } of entries) {
      let cMap = countryMaps.get(item.adm0);
      if (!cMap) { cMap = new Map(); countryMaps.set(item.adm0, cMap); }
      for (const rawKey of keys[tier]) {
        const k = tier === 4 ? rawKey : norm(rawKey);
        if (!k) continue;
        if (!globalMap.has(k)) globalMap.set(k, item);
        if (!cMap.has(k)) cMap.set(k, item);
      }
    }
  }

  // Synthesize macro-region groups (e.g. France's Île-de-France, Italy's Toscana)
  const byRegionGroup = new Map(); // global norm(region) & shared aliases -> composite
  const byCountryRegionGroup = new Map(); // adm0 -> Map<key, composite>
  const composites = [];
  for (const { adm0, region, rk, parts } of groupBuckets.values()) {
    const polygons = parts.flatMap((p) => p.polygons);
    // For multi-part macro-regions, compute aliases shared across ALL constituent parts
    let sharedKeys = [];
    const sharedNames = [];
    if (parts.length >= 2) {
      const firstMap = new Map();
      for (const rawName of parts[0].names) {
        const k = norm(rawName);
        if (k && !firstMap.has(k)) firstMap.set(k, rawName);
      }
      for (let i = 1; i < parts.length && firstMap.size; i++) {
        const partKeys = new Set();
        for (const rawName of parts[i].names) {
          const k = norm(rawName);
          if (k) partKeys.add(k);
        }
        for (const k of firstMap.keys()) {
          if (!partKeys.has(k)) firstMap.delete(k);
        }
      }
      sharedKeys = [...firstMap.keys()];
      sharedNames.push(...firstMap.values());
    }
    const composite = {
      id: `${adm0}:${region}`,
      iso: null,
      adm0,
      name: region,
      names: sharedNames,
      zh: null,
      local: null,
      region,
      type: 'Region',
      polygons,
      bbox: bboxOf(polygons),
      mainBBox: mainBBoxOf(polygons),
      parts,
    };
    composites.push({ adm0, rk, sharedKeys, composite });
  }

  // Pass 1: index canonical region names first so they win over shared aliases
  for (const { adm0, rk, composite } of composites) {
    if (!byRegionGroup.has(rk)) byRegionGroup.set(rk, composite);
    let cg = byCountryRegionGroup.get(adm0);
    if (!cg) { cg = new Map(); byCountryRegionGroup.set(adm0, cg); }
    if (!cg.has(rk)) cg.set(rk, composite);
  }
  // Pass 2: index shared aliases for multi-part macro-regions
  for (const { adm0, sharedKeys, composite } of composites) {
    const cg = byCountryRegionGroup.get(adm0);
    for (const sk of sharedKeys) {
      if (!byRegionGroup.has(sk)) byRegionGroup.set(sk, composite);
      if (!cg.has(sk)) cg.set(sk, composite);
    }
  }

  return {
    _kind: 'admin1',
    source: raw.source || label,
    regions: entries.map((e) => e.item),
    byPrimaryKey,
    byAliasKey,
    byCountry,
    byCountryPrimaryKey,
    byCountryAliasKey,
    byRegionGroup,
    byCountryRegionGroup,
  };
}

function loadAdmin1(source) {
  if (source && source._kind === 'admin1') return source;
  const key = source ?? BUNDLED_ADMIN1;
  if (caches.admin1.has(key)) return caches.admin1.get(key);
  const raw = typeof key === 'string' ? readJsonFile(key) : key;
  if (!raw || !Array.isArray(raw.regions)) throw new Error('Not a Natural Earth admin-1 dataset');
  const ds = indexAdmin1(raw, typeof key === 'string' ? path.basename(key) : 'custom');
  caches.admin1.set(key, ds);
  return ds;
}

function findAdmin1(id, opts) {
  if (id && typeof id === 'object' && Array.isArray(id.polygons)) return id;
  const o = opts || {};
  const ds = loadAdmin1(o.source);
  const q = norm(id);
  if (!q) return null;
  const stripped = stripCjkSuffix(q);
  const lookup = (map) => (map ? (map.get(q) || (stripped ? map.get(stripped) : null) || null) : null);

  if (o.country) {
    const code = resolveCountryCode(o.country, o.countrySource);
    if (!code) return null;
    return (
      lookup(ds.byCountryPrimaryKey.get(code))
      || lookup(ds.byCountryRegionGroup.get(code))
      || lookup(ds.byCountryAliasKey.get(code))
    );
  }

  return (
    lookup(ds.byPrimaryKey)
    || lookup(ds.byRegionGroup)
    || lookup(ds.byAliasKey)
  );
}

function getAdmin1(id, opts) {
  if (id && typeof id === 'object' && Array.isArray(id.polygons)) return id;
  const o = opts || {};
  const hit = findAdmin1(id, o);
  if (hit) return hit;
  const ds = loadAdmin1(o.source);
  const q = norm(id);
  const minLen = minSuggestionLen(q);
  const code = o.country ? resolveCountryCode(o.country, o.countrySource) : null;
  const pool = code ? (ds.byCountry.get(code) || []) : ds.regions;
  const near = pool
    .filter((r) => q.length >= minLen && (
      norm(r.name).includes(q)
      || q.includes(norm(r.name))
      || (r.zh && (norm(r.zh).includes(q) || q.includes(norm(r.zh))))
    ))
    .slice(0, 5)
    .map((r) => `${r.name} (${r.id})`);
  const scope = code ? ` in ${code}` : '';
  throw new Error(`Unknown admin-1 region "${fmtId(id)}"${scope}${near.length ? ` — did you mean ${near.join(', ')}?` : ''}`);
}

function listAdmin1(countryId, source) {
  const ds = loadAdmin1(source);
  const list = countryId
    ? (ds.byCountry.get(resolveCountryCode(countryId)) || [])
    : ds.regions;
  return list.map(({ id, adm0, name, zh, local, region, type, bbox, mainBBox }) => ({
    id, adm0, name, zh, local, region, type, bbox, mainBBox,
  }));
}

function admin1InBBox(bbox, opts) {
  const o = opts || {};
  const boxes = shiftedBBoxes(bbox);
  if (!boxes.length) return [];
  const ds = loadAdmin1(o.source);
  const pool = o.country
    ? (ds.byCountry.get(resolveCountryCode(o.country, o.countrySource)) || [])
    : ds.regions;
  return pool.filter(
    (r) => bboxTouches(r.bbox, boxes) && r.polygons.some((poly) => bboxTouches(bboxOf([poly]), boxes)),
  );
}

// =========================================================================
// 3. Rivers & Lake Centerlines
// =========================================================================
function indexRivers(raw, label) {
  const byKey = new Map();
  const rivers = raw.rivers.map((r) => {
    const lines = raw.flat ? r.lines.map(unflatten) : r.lines;
    return {
      name: r.name || null,
      names: r.names || [],
      zh: r.zh || null,
      kind: r.kind || 'River',
      rank: r.rank ?? 6,
      lines,
      bbox: bboxOfLines(lines),
    };
  });

  // Sort candidates for byKey so actual 'River' beats 'Lake Centerline' and lower rank wins
  const ordered = rivers.slice().sort((a, b) => (
    (a.kind === 'Lake Centerline' ? 1 : 0) - (b.kind === 'Lake Centerline' ? 1 : 0)
    || a.rank - b.rank
  ));
  const tiers = [
    (r) => (r.name ? [r.name] : []),
    (r) => (r.zh ? [r.zh] : []),
    (r) => r.names,
    (r) => [r.zh, ...r.names].map((s) => stripCjkSuffix(norm(s))).filter(Boolean),
  ];
  for (let tier = 0; tier < tiers.length; tier++) {
    for (const r of ordered) {
      for (const rawKey of tiers[tier](r)) {
        const k = tier === 3 ? rawKey : norm(rawKey);
        if (k && !byKey.has(k)) byKey.set(k, r);
      }
    }
  }
  return { _kind: 'rivers', source: raw.source || label, rivers, byKey };
}

function loadRivers(source) {
  if (source && source._kind === 'rivers') return source;
  const key = source ?? BUNDLED_RIVERS;
  if (caches.rivers.has(key)) return caches.rivers.get(key);
  const raw = typeof key === 'string' ? readJsonFile(key) : key;
  if (!raw || !Array.isArray(raw.rivers)) throw new Error('Not a Natural Earth rivers dataset');
  const ds = indexRivers(raw, typeof key === 'string' ? path.basename(key) : 'custom');
  caches.rivers.set(key, ds);
  return ds;
}

function riversInBBox(bbox, opts) {
  const o = opts || {};
  const boxes = shiftedBBoxes(bbox);
  if (!boxes.length) return [];
  const ds = loadRivers(o.source);
  const includeLC = o.includeLakeCenterlines === true;
  const minRank = finiteNum(o.minRank);
  const maxRank = finiteNum(o.maxRank);
  return ds.rivers
    .filter((r) => {
      if (!includeLC && r.kind === 'Lake Centerline') return false;
      if (minRank !== null && r.rank < minRank) return false;
      if (maxRank !== null && r.rank > maxRank) return false;
      return bboxTouches(r.bbox, boxes) && r.lines.some((line) => bboxTouches(bboxOfLines([line]), boxes));
    })
    .sort((a, b) => a.rank - b.rank);
}

function findRiver(name, source) {
  if (name && typeof name === 'object' && Array.isArray(name.lines)) return name;
  const ds = loadRivers(extractSource(source));
  const q = norm(name);
  if (!q) return null;
  const stripped = stripCjkSuffix(q);
  return ds.byKey.get(q) || (stripped ? ds.byKey.get(stripped) : null) || null;
}

function getRiver(name, source) {
  if (name && typeof name === 'object' && Array.isArray(name.lines)) return name;
  const hit = findRiver(name, source);
  if (hit) return hit;
  const ds = loadRivers(extractSource(source));
  const q = norm(name);
  const minLen = minSuggestionLen(q);
  const seen = new Set();
  const near = [];
  for (const r of ds.rivers) {
    if (!r.name || seen.has(r.name)) continue;
    const rn = norm(r.name);
    if (q.length >= minLen && (rn.includes(q) || q.includes(rn) || r.names.some((n) => norm(n).includes(q)))) {
      seen.add(r.name);
      near.push(r.name);
      if (near.length >= 5) break;
    }
  }
  throw new Error(`Unknown river "${fmtId(name)}"${near.length ? ` — did you mean ${near.join(', ')}?` : ''}`);
}

// =========================================================================
// 4. Lakes & Reservoirs
// =========================================================================
function indexLakes(raw, label) {
  const byKey = new Map();
  const lakes = raw.lakes.map((l) => {
    const polygons = raw.flat ? l.polygons.map((poly) => poly.map(unflatten)) : l.polygons;
    let area = 0;
    for (const poly of polygons) area += ringArea(poly[0]);
    return {
      name: l.name || null,
      names: l.names || [],
      zh: l.zh || null,
      kind: l.kind || 'Lake',
      rank: l.rank ?? 6,
      area,
      polygons,
      bbox: bboxOf(polygons),
    };
  });

  const ordered = lakes.slice().sort((a, b) => a.rank - b.rank || b.area - a.area);
  const tiers = [
    (l) => (l.name ? [l.name] : []),
    (l) => (l.zh ? [l.zh] : []),
    (l) => l.names,
    (l) => [l.zh, ...l.names].map((s) => stripCjkSuffix(norm(s))).filter(Boolean),
  ];
  for (let tier = 0; tier < tiers.length; tier++) {
    for (const l of ordered) {
      for (const rawKey of tiers[tier](l)) {
        const k = tier === 3 ? rawKey : norm(rawKey);
        if (k && !byKey.has(k)) byKey.set(k, l);
      }
    }
  }
  return { _kind: 'lakes', source: raw.source || label, lakes, byKey };
}

function loadLakes(source) {
  if (source && source._kind === 'lakes') return source;
  const key = source ?? BUNDLED_LAKES;
  if (caches.lakes.has(key)) return caches.lakes.get(key);
  const raw = typeof key === 'string' ? readJsonFile(key) : key;
  if (!raw || !Array.isArray(raw.lakes)) throw new Error('Not a Natural Earth lakes dataset');
  const ds = indexLakes(raw, typeof key === 'string' ? path.basename(key) : 'custom');
  caches.lakes.set(key, ds);
  return ds;
}

function lakesInBBox(bbox, opts) {
  const o = opts || {};
  const boxes = shiftedBBoxes(bbox);
  if (!boxes.length) return [];
  const ds = loadLakes(o.source);
  const maxRank = finiteNum(o.maxRank);
  const minArea = finiteNum(o.minArea);
  return ds.lakes
    .filter((l) => {
      if (maxRank !== null && l.rank > maxRank) return false;
      if (minArea !== null && l.area < minArea) return false;
      return bboxTouches(l.bbox, boxes) && l.polygons.some((poly) => bboxTouches(bboxOf([poly]), boxes));
    })
    .sort((a, b) => a.rank - b.rank || b.area - a.area);
}

function findLake(name, source) {
  if (name && typeof name === 'object' && Array.isArray(name.polygons)) return name;
  const ds = loadLakes(extractSource(source));
  const q = norm(name);
  if (!q) return null;
  const stripped = stripCjkSuffix(q);
  return ds.byKey.get(q) || (stripped ? ds.byKey.get(stripped) : null) || null;
}

function getLake(name, source) {
  if (name && typeof name === 'object' && Array.isArray(name.polygons)) return name;
  const hit = findLake(name, source);
  if (hit) return hit;
  const ds = loadLakes(extractSource(source));
  const q = norm(name);
  const minLen = minSuggestionLen(q);
  const seen = new Set();
  const near = [];
  for (const l of ds.lakes) {
    if (!l.name || seen.has(l.name)) continue;
    const ln = norm(l.name);
    if (q.length >= minLen && (ln.includes(q) || q.includes(ln) || (l.zh && norm(l.zh).includes(q)))) {
      seen.add(l.name);
      near.push(l.name);
      if (near.length >= 5) break;
    }
  }
  throw new Error(`Unknown lake "${fmtId(name)}"${near.length ? ` — did you mean ${near.join(', ')}?` : ''}`);
}

// =========================================================================
// 5. Populated Places (Cities & Capitals)
// =========================================================================
function indexPlaces(raw, label) {
  const places = raw.places
    .map((p) => ({
      name: p.name,
      ascii: p.ascii || p.name,
      names: p.names || [],
      zh: p.zh || null,
      ja: p.ja || null,
      ko: p.ko || null,
      adm0: p.adm0 || null,
      adm1: p.adm1 || null,
      capital: Boolean(p.capital),
      adm1Capital: Boolean(p.adm1Capital),
      pop: Number(p.pop) || 0,
      rank: p.rank ?? 10,
      lon: p.lon,
      lat: p.lat,
    }))
    .sort((a, b) => (
      (b.capital ? 1 : 0) - (a.capital ? 1 : 0)
      || b.pop - a.pop
      || a.rank - b.rank
    ));

  const byKey = new Map();
  const addKey = (k, p) => {
    if (!k) return;
    let arr = byKey.get(k);
    if (!arr) { arr = []; byKey.set(k, arr); }
    if (!arr.includes(p)) arr.push(p);
  };

  for (const p of places) {
    const rawKeys = [p.name, p.ascii, p.zh, p.ja, p.ko, ...p.names].filter(Boolean);
    for (const s of rawKeys) {
      const k = norm(s);
      addKey(k, p);
      const sk = stripCjkSuffix(k);
      if (sk) addKey(sk, p);
    }
  }
  return { _kind: 'places', source: raw.source || label, places, byKey };
}

function loadPlaces(source) {
  if (source && source._kind === 'places') return source;
  const key = source ?? BUNDLED_PLACES;
  if (caches.places.has(key)) return caches.places.get(key);
  const raw = typeof key === 'string' ? readJsonFile(key) : key;
  if (!raw || !Array.isArray(raw.places)) throw new Error('Not a Natural Earth populated places dataset');
  const ds = indexPlaces(raw, typeof key === 'string' ? path.basename(key) : 'custom');
  caches.places.set(key, ds);
  return ds;
}

function buildAdmin1Matcher(admin1Opt, countryCode, admin1Source) {
  if (!admin1Opt) return null;
  const keys = new Set();
  const q = norm(admin1Opt);
  if (q) keys.add(q);
  const sq = stripCjkSuffix(q);
  if (sq) keys.add(sq);
  try {
    const a1 = findAdmin1(admin1Opt, { country: countryCode || undefined, source: admin1Source });
    if (a1) {
      const an = norm(a1.name);
      if (an) keys.add(an);
      for (const n of a1.names || []) {
        const nk = norm(n);
        if (nk) keys.add(nk);
      }
    }
  } catch {
    // Ignore if admin-1 dataset is unavailable
  }
  return (pAdm1) => {
    if (!pAdm1) return false;
    const pk = norm(pAdm1);
    if (!pk) return false;
    const spk = stripCjkSuffix(pk);
    return keys.has(pk) || (Boolean(spk) && keys.has(spk));
  };
}

function placesInBBox(bbox, opts) {
  const o = opts || {};
  const boxes = shiftedBBoxes(bbox);
  if (!boxes.length) return [];
  const ds = loadPlaces(o.source);
  let countryCode = null;
  if (o.country) {
    countryCode = resolveCountryCode(o.country, o.countrySource);
    if (!countryCode) return [];
  }
  const matchAdm1 = buildAdmin1Matcher(o.admin1, countryCode, o.admin1Source);
  const maxRank = finiteNum(o.maxRank);
  const minPop = finiteNum(o.minPop);
  const limit = finiteNum(o.limit);
  const capitalsOnly = o.capitalsOnly === true;

  const out = ds.places.filter((p) => {
    if (!pointInBBox(p.lon, p.lat, boxes)) return false;
    if (countryCode && p.adm0 !== countryCode) return false;
    if (matchAdm1 && !matchAdm1(p.adm1)) return false;
    if (capitalsOnly && !p.capital) return false;
    if (maxRank !== null && p.rank > maxRank) return false;
    if (minPop !== null && p.pop < minPop) return false;
    return true;
  });
  return limit !== null && limit >= 0 ? out.slice(0, limit) : out;
}

function findPlace(name, opts) {
  if (name && typeof name === 'object' && Number.isFinite(name.lon) && Number.isFinite(name.lat)) {
    return name;
  }
  const o = opts || {};
  const ds = loadPlaces(o.source);
  const q = norm(name);
  if (!q) return null;
  const stripped = stripCjkSuffix(q);
  const candidates = ds.byKey.get(q) || (stripped ? ds.byKey.get(stripped) : null);
  if (!candidates || !candidates.length) return null;

  let countryCode = null;
  if (o.country) {
    countryCode = resolveCountryCode(o.country, o.countrySource);
    if (!countryCode) return null;
  }
  const matchAdm1 = buildAdmin1Matcher(o.admin1, countryCode, o.admin1Source);
  return candidates.find((p) => (
    (!countryCode || p.adm0 === countryCode)
    && (!matchAdm1 || matchAdm1(p.adm1))
  )) || null;
}

function getPlace(name, opts) {
  if (name && typeof name === 'object' && Number.isFinite(name.lon) && Number.isFinite(name.lat)) {
    return name;
  }
  const o = opts || {};
  const hit = findPlace(name, o);
  if (hit) return hit;
  const ds = loadPlaces(o.source);
  const q = norm(name);
  const minLen = minSuggestionLen(q);
  const countryCode = o.country ? resolveCountryCode(o.country, o.countrySource) : null;
  const near = ds.places
    .filter((p) => {
      if (countryCode && p.adm0 !== countryCode) return false;
      if (q.length < minLen) return false;
      return (
        norm(p.name).includes(q)
        || q.includes(norm(p.name))
        || (p.zh && norm(p.zh).includes(q))
        || (p.ja && norm(p.ja).includes(q))
        || (p.ko && norm(p.ko).includes(q))
      );
    })
    .slice(0, 5)
    .map((p) => `${p.name} (${p.adm0})`);
  const scope = countryCode ? ` in ${countryCode}` : '';
  throw new Error(`Unknown place "${fmtId(name)}"${scope}${near.length ? ` — did you mean ${near.join(', ')}?` : ''}`);
}

// =========================================================================
// 6. Landforms & Elevation Peaks
// =========================================================================
function indexLandforms(raw, label) {
  const peaks = (raw.peaks || [])
    .map((p) => ({
      name: p.name,
      names: p.names || [],
      zh: p.zh || null,
      kind: p.kind || 'mountain',
      elevation: p.elevation ?? null,
      region: p.region || null,
      rank: p.rank ?? 6,
      lon: p.lon,
      lat: p.lat,
    }))
    .sort((a, b) => (b.elevation ?? -Infinity) - (a.elevation ?? -Infinity));

  const regions = (raw.regions || [])
    .map((r) => {
      const polygons = raw.flat ? r.polygons.map((poly) => poly.map(unflatten)) : r.polygons;
      return {
        name: r.name,
        names: r.names || [],
        zh: r.zh || null,
        kind: r.kind || 'Range/mtn',
        region: r.region || null,
        rank: r.rank ?? 6,
        polygons,
        bbox: bboxOf(polygons),
        mainBBox: mainBBoxOf(polygons),
      };
    })
    .sort((a, b) => a.rank - b.rank);

  return { _kind: 'landforms', source: raw.source || label, peaks, regions };
}

function loadLandforms(source) {
  if (source && source._kind === 'landforms') return source;
  const key = source ?? BUNDLED_LANDFORMS;
  if (caches.landforms.has(key)) return caches.landforms.get(key);
  const raw = typeof key === 'string' ? readJsonFile(key) : key;
  if (!raw || (!Array.isArray(raw.peaks) && !Array.isArray(raw.regions))) {
    throw new Error('Not a Natural Earth landforms dataset');
  }
  const ds = indexLandforms(raw, typeof key === 'string' ? path.basename(key) : 'custom');
  caches.landforms.set(key, ds);
  return ds;
}

function peaksInBBox(bbox, opts) {
  const o = opts || {};
  const boxes = shiftedBBoxes(bbox);
  if (!boxes.length) return [];
  const ds = loadLandforms(o.source);
  const minElev = finiteNum(o.minElev);
  const kindOpt = Object.prototype.hasOwnProperty.call(o, 'kind') ? o.kind : 'mountain';
  let kindSet = null;
  if (kindOpt != null && kindOpt !== 'all') {
    const arr = Array.isArray(kindOpt) ? kindOpt : [kindOpt];
    const validKinds = arr.filter((k) => typeof k === 'string').map((k) => k.toLowerCase());
    if (!validKinds.length) return [];
    kindSet = new Set(validKinds);
  }
  return ds.peaks.filter((p) => {
    if (!pointInBBox(p.lon, p.lat, boxes)) return false;
    if (kindSet && !kindSet.has(typeof p.kind === 'string' ? p.kind.toLowerCase() : '')) return false;
    if (minElev !== null && (p.elevation == null || p.elevation < minElev)) return false;
    return true;
  });
}

function landformsInBBox(bbox, opts) {
  const o = opts || {};
  const boxes = shiftedBBoxes(bbox);
  if (!boxes.length) return [];
  const ds = loadLandforms(o.source);
  const maxRank = finiteNum(o.maxRank);
  let kindSet = null;
  if (o.kinds != null) {
    const arr = Array.isArray(o.kinds) ? o.kinds : [o.kinds];
    const validKinds = arr.filter((k) => typeof k === 'string').map((k) => k.toLowerCase());
    if (!validKinds.length) return [];
    kindSet = new Set(validKinds);
  }
  return ds.regions.filter((r) => {
    if (kindSet && !kindSet.has(typeof r.kind === 'string' ? r.kind.toLowerCase() : '')) return false;
    if (maxRank !== null && r.rank > maxRank) return false;
    return bboxTouches(r.bbox, boxes) && r.polygons.some((poly) => bboxTouches(bboxOf([poly]), boxes));
  });
}

// =========================================================================
// 7. Unified Region Resolver
// =========================================================================
const ISO_3166_2_RE = /^[A-Za-z]{2}-[A-Za-z0-9]{1,3}$/;

function resolveRegion(target, opts) {
  const o = opts || {};
  // 1. Explicit [west, south, east, north] bbox array
  if (Array.isArray(target)) {
    if (!isValidBBox(target)) {
      if (
        target.length === 4
        && typeof target[0] === 'number' && Number.isFinite(target[0])
        && typeof target[1] === 'number' && Number.isFinite(target[1])
        && typeof target[2] === 'number' && Number.isFinite(target[2])
        && typeof target[3] === 'number' && Number.isFinite(target[3])
        && target[1] > target[3]
      ) {
        throw new Error(`Invalid bbox target: south (${target[1]}) must be <= north (${target[3]})`);
      }
      throw new Error('Invalid bbox target: expected [west, south, east, north] of 4 finite numbers');
    }
    return { kind: 'bbox', bbox: target, mainBBox: target, feature: null };
  }

  // 2. Object target: already-resolved, feature with polygons, or { country, admin1, bbox }
  if (target && typeof target === 'object') {
    if (target.kind && Array.isArray(target.bbox) && Array.isArray(target.mainBBox)) {
      if (!isValidBBox(target.bbox) || !isValidBBox(target.mainBBox)) {
        throw new Error('Invalid region target: bbox and mainBBox must be [west, south, east, north] of 4 finite numbers with south <= north');
      }
      return target;
    }
    if (Array.isArray(target.polygons)) {
      const bbox = target.bbox || bboxOf(target.polygons);
      const mainBBox = target.mainBBox || mainBBoxOf(target.polygons);
      if (!isValidBBox(bbox) || !isValidBBox(mainBBox)) {
        throw new Error('Invalid region target: polygons produced an empty or invalid bounding box');
      }
      return {
        kind: target.adm0 ? 'admin1' : 'country',
        bbox,
        mainBBox,
        feature: target,
      };
    }
    if (target.admin1 != null) {
      const r = getAdmin1(target.admin1, {
        country: target.country ?? o.country,
        source: o.admin1Source,
        countrySource: o.countrySource ?? o.source,
      });
      return { kind: 'admin1', bbox: r.bbox, mainBBox: r.mainBBox, feature: r };
    }
    if (target.country != null) {
      const c = getCountry(target.country, o.countrySource ?? o.source);
      return { kind: 'country', bbox: c.bbox, mainBBox: c.mainBBox, feature: c };
    }
    if (Array.isArray(target.bbox)) {
      return resolveRegion(target.bbox, o);
    }
    throw new Error('Invalid region target object: expected { country, admin1 }, { country }, or { bbox }');
  }

  // 3. String target
  if (typeof target === 'string') {
    const trimmed = target.trim();
    if (!trimmed) throw new Error('Empty region target');

    // Precedence 1: opts.country scopes strictly to admin-1 inside that country
    if (o.country) {
      const r = getAdmin1(trimmed, {
        country: o.country,
        source: o.admin1Source,
        countrySource: o.countrySource ?? o.source,
      });
      return { kind: 'admin1', bbox: r.bbox, mainBBox: r.mainBBox, feature: r };
    }

    // Precedence 2: ISO-3166-2 code (e.g. 'CN-SC', 'US-CA')
    if (ISO_3166_2_RE.test(trimmed)) {
      const r = findAdmin1(trimmed, { source: o.admin1Source });
      if (r) return { kind: 'admin1', bbox: r.bbox, mainBBox: r.mainBBox, feature: r };
    }

    // Precedence 3: Country before Admin-1 (preserves backward compat & lazy loading)
    const c = findCountry(trimmed, o.countrySource ?? o.source);
    if (c) return { kind: 'country', bbox: c.bbox, mainBBox: c.mainBBox, feature: c };

    // Precedence 4: Admin-1 fallback
    const r = findAdmin1(trimmed, { source: o.admin1Source });
    if (r) return { kind: 'admin1', bbox: r.bbox, mainBBox: r.mainBBox, feature: r };

    // Build helpful suggestions across countries and admin-1
    const q = norm(trimmed);
    const minLen = minSuggestionLen(q);
    const near = [];
    if (q.length >= minLen) {
      for (const item of loadCountries(o.countrySource ?? o.source).countries) {
        if (norm(item.name).includes(q) || q.includes(norm(item.name))) {
          near.push(`${item.name} (${item.id})`);
          if (near.length >= 3) break;
        }
      }
      for (const item of loadAdmin1(o.admin1Source).regions) {
        if (norm(item.name).includes(q) || (item.zh && norm(item.zh).includes(q))) {
          near.push(`${item.name} (${item.id})`);
          if (near.length >= 5) break;
        }
      }
    }
    throw new Error(`Unknown region "${fmtId(target)}"${near.length ? ` — did you mean ${near.join(', ')}?` : ''}`);
  }

  throw new Error('Invalid region target: expected [w, s, e, n], string, or { country, admin1 }');
}

module.exports = {
  // Existing exports (100% backward compatible)
  loadCountries,
  getCountry,
  findCountry,
  listCountries,
  countriesInBBox,
  fromGeoJSON,
  bboxOf,
  mainBBoxOf,
  ringArea,
  // New M2 exports
  loadAdmin1,
  getAdmin1,
  findAdmin1,
  listAdmin1,
  admin1InBBox,
  loadRivers,
  riversInBBox,
  findRiver,
  getRiver,
  loadLakes,
  lakesInBBox,
  findLake,
  getLake,
  loadPlaces,
  placesInBBox,
  findPlace,
  getPlace,
  loadLandforms,
  peaksInBBox,
  landformsInBBox,
  resolveRegion,
  // Utilities
  norm,
  bboxIntersects,
};
