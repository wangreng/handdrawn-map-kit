'use strict';
// Country outlines from Natural Earth (public domain, https://www.naturalearthdata.com/).
// The bundled dataset is the 1:50m "Admin 0 – Countries" layer; any other Natural Earth
// countries GeoJSON (e.g. the 1:10m one) can be passed as `source` for more detail.
const fs = require('fs');
const path = require('path');

const BUNDLED = path.join(__dirname, '..', 'data', 'ne_50m_admin_0_countries.json');
const cache = new Map();

const norm = (s) => String(s).normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const valid = (v) => v != null && v !== '' && String(v) !== '-99';

// Natural Earth GeoJSON FeatureCollection -> { countries: [{ id, name, names, iso2, continent, polygons }] }
function fromGeoJSON(geojson) {
  const countries = [];
  for (const f of geojson.features || []) {
    const p = f.properties || {};
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    const id = [p.ADM0_A3, p.ISO_A3_EH, p.ISO_A3, p.SOV_A3].find(valid);
    const name = [p.NAME, p.ADMIN, p.NAME_LONG].find(valid);
    if (!id || !name) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const names = [...new Set([p.ADMIN, p.NAME_LONG, p.BRK_NAME, p.FORMAL_EN].filter((n) => valid(n) && n !== name))];
    countries.push({
      id: String(id).toUpperCase(),
      name,
      names,
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
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

// [west, south, east, north] of a list of polygons (outer rings only)
function bboxOf(polygons) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of polygons) {
    for (const [lon, lat] of poly[0]) {
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
  let big = polygons[0], bigArea = -1;
  for (const poly of polygons) {
    const a = ringArea(poly[0]);
    if (a > bigArea) { bigArea = a; big = poly; }
  }
  const [w, s, e, n] = bboxOf([big]);
  const mx = Math.min(8, (e - w) * 0.5), my = Math.min(8, (n - s) * 0.5);
  const near = polygons.filter((poly) => {
    const [pw, ps, pe, pn] = bboxOf([poly]);
    const cx = (pw + pe) / 2, cy = (ps + pn) / 2;
    return cx >= w - mx && cx <= e + mx && cy >= s - my && cy <= n + my;
  });
  return bboxOf(near);
}

function index(raw, label) {
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
    for (const key of [c.id, c.name, ...(c.names || [])]) {
      const k = norm(key);
      if (k && !byKey.has(k)) byKey.set(k, country);
    }
    return { country, iso2: c.iso2 };
  });
  // Two-letter codes last so they never shadow a name or three-letter code
  for (const { country, iso2 } of countries) {
    if (iso2 && !byKey.has(norm(iso2))) byKey.set(norm(iso2), country);
  }
  return { source: raw.source || label, countries: countries.map((c) => c.country), byKey };
}

// Load a country dataset. `source` may be omitted (bundled Natural Earth 1:50m), a path to a
// Natural Earth countries GeoJSON / a file written by scripts/build-natural-earth.js, or an
// already parsed object of either kind.
function loadCountries(source) {
  if (source && source.byKey) return source;
  const key = source ?? BUNDLED;
  if (cache.has(key)) return cache.get(key);
  const raw = typeof key === 'string' ? JSON.parse(fs.readFileSync(key, 'utf8')) : key;
  const data = raw.type === 'FeatureCollection' ? fromGeoJSON(raw) : raw;
  if (!Array.isArray(data.countries)) throw new Error('Not a Natural Earth countries dataset');
  const ds = index(data, typeof key === 'string' ? path.basename(key) : 'custom');
  cache.set(key, ds);
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
  const near = ds.countries
    .filter((c) => q.length >= 3 && (norm(c.name).includes(q) || q.includes(norm(c.name))))
    .slice(0, 5)
    .map((c) => `${c.name} (${c.id})`);
  throw new Error(`Unknown country "${id}"${near.length ? ` — did you mean ${near.join(', ')}?` : ''}`);
}

function listCountries(source) {
  return loadCountries(source).countries.map(({ id, name, iso2, continent }) => ({ id, name, iso2, continent }));
}

const bboxIntersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

// All countries with at least one polygon whose bounding box touches [west, south, east, north]
function countriesInBBox(bbox, source) {
  return loadCountries(source).countries.filter(
    (c) => bboxIntersects(c.bbox, bbox) && c.polygons.some((poly) => bboxIntersects(bboxOf([poly]), bbox)),
  );
}

module.exports = {
  loadCountries,
  getCountry,
  findCountry,
  listCountries,
  countriesInBBox,
  fromGeoJSON,
  bboxOf,
  mainBBoxOf,
  ringArea,
};
