'use strict';
const { plate } = require('../engine/lib/storybook');
const { person, POSES } = require('../engine/lib/people');
const D = require('../engine/lib/draw');
const M = require('./mapPrimitives');
const EL = require('./elements');
const GEO = require('./geo');
const FLAGS = require('./flags');

function createMap(opts = {}) {
  const w = opts.w ?? 300;
  const h = opts.h ?? 200;
  const ppm = opts.ppm ?? 10;
  const pad = opts.pad ?? 4.8;
  const inner = opts.inner ?? 8.0;

  const P = plate({
    id: opts.id || 'map',
    w,
    h,
    ppm,
    seed: opts.seed || 'map-1',
    paper: opts.paper || 'hotpress',
  });

  if (opts.ocean !== false) {
    M.drawOcean(P, { pad, color: typeof opts.ocean === 'string' ? opts.ocean : M.PALETTE.ocean });
  }

  let graticuleTicks = [];
  const el = {};
  for (const [name, fn] of Object.entries(EL)) {
    el[name] = (...args) => fn(P, ...args);
  }

  return {
    P,
    D,
    PALETTE: M.PALETTE,
    POSES,
    part: (poly, color, o) => M.part(P, poly, color, o),
    at: M.at,
    createProjection: M.createProjection,
    // Projection showing `target` (country code / name, or [west, south, east, north]) as large as
    // fits in `frame` (default: the whole map area inside the border)
    fitProjection(target, o = {}) {
      const bbox = Array.isArray(target) ? target : GEO.getCountry(target, o.source).mainBBox;
      const m = inner + (o.margin ?? 6);
      return M.fitProjection(bbox, { ...o, frame: o.frame || [m, m, w - m, h - m] });
    },

    // Natural Earth country outline as smoothed mm rings, ready for part() / coastWaterlines()
    countryRings: (proj, id, o = {}) => M.geoRings(P, proj, GEO.getCountry(id, o.source).polygons, o),
    // Draw `focus` (one country or a list) with its neighbours and coastal waterlines.
    // Returns { focus: [{ country, rings }], neighbors: [{ country, rings }] }.
    countries(proj, o = {}) {
      const focus = [].concat(o.focus || []).map((id) => GEO.getCountry(id, o.source));
      const ids = new Set(focus.map((c) => c.id));
      let neighbors = [];
      if (Array.isArray(o.neighbors)) neighbors = o.neighbors.map((id) => GEO.getCountry(id, o.source));
      else if (o.neighbors !== false) neighbors = GEO.countriesInBBox(proj.extent([0, 0, w, h]), o.source);
      const ringsOf = (country) => ({ country, rings: M.geoRings(P, proj, country.polygons, o) });
      const out = {
        focus: focus.map(ringsOf),
        neighbors: neighbors.filter((c) => !ids.has(c.id)).map(ringsOf).filter((n) => n.rings.length),
      };
      const all = [...out.neighbors, ...out.focus].filter((c) => c.rings.length);
      if (o.waterlines !== false && all.length) M.drawCoastWaterlines(P, all.flatMap((c) => c.rings), o.waterlines || {});
      for (const n of out.neighbors) {
        M.part(P, n.rings, o.neighborColor || M.PALETTE.neighborLand, { pressure: 0.55, passes: 2, blunt: true, nib: 0.26, outlineColor: '#5c5549' });
      }
      for (const [i, f] of out.focus.entries()) {
        if (!f.rings.length) continue;
        const color = [].concat(o.color || M.PALETTE.land)[i] ?? M.PALETTE.land;
        M.part(P, f.rings, color, { pressure: 0.64, passes: 2, blunt: true, nib: 0.32 });
      }
      return out;
    },

    // Cartographic layers
    graticule(proj, o = {}) {
      graticuleTicks = M.drawGraticule(P, proj, { inner, ...o });
      return graticuleTicks;
    },
    coastWaterlines: (polys, o) => M.drawCoastWaterlines(P, polys, o),
    land: (pts, o) => M.drawLand(P, pts, o),
    mountainRange: (peaks, o) => M.drawMountainRange(P, peaks, o),
    riceFields: (cx, cy, w2, h2) => M.drawRiceFields(P, cx, cy, w2, h2),
    river: (pts, o) => M.drawRiver(P, pts, o),
    route: (pts, o) => M.drawRoute(P, pts, o),
    callout: (fromPt, toPt, o) => M.drawCallout(P, fromPt, toPt, o),
    waves: (x, y, s, count) => M.drawWaves(P, x, y, s, count),
    city: (x, y, name, o) => M.drawCity(P, x, y, name, o),
    compass: (cx, cy, r, o) => M.drawCompass(P, cx, cy, r, o),
    cartouche: (x, y, w2, h2, info) => M.drawCartouche(P, x, y, w2, h2, info),
    insetBox: (x, y, w2, h2, title) => M.drawInsetBox(P, x, y, w2, h2, title),

    // Typography
    label: (text, x, y, o = {}) => P.text(text, x, y, { face: 'serif-bold', size: 2.6, align: 'center', ...o }),
    seaLabel: (text, x, y, o = {}) => P.italic(text, x, y, { face: 'serif-bold', size: 3.4, align: 'center', color: '#426a80', spacing: 0.16, ...o }),
    regionLabel: (text, x, y, o = {}) => P.text(text, x, y, { face: 'serif-bold', size: 2.5, align: 'center', color: '#7a6852', spacing: 0.22, ...o }),

    // Characters & elements
    person: (x, y, scale = 0.52, o = {}) => person(P, x, y, scale, o),
    el,

    async save(filePath, saveOpts = {}) {
      if (opts.border !== false) {
        M.drawZebraBorder(P, { pad, inner, ticks: graticuleTicks });
      }
      return P.finish(filePath, saveOpts);
    },
  };
}

module.exports = {
  createMap,
  createProjection: M.createProjection,
  fitProjection: M.fitProjection,
  PALETTE: M.PALETTE,
  POSES,
  // Natural Earth country data
  getCountry: GEO.getCountry,
  listCountries: GEO.listCountries,
  countriesInBBox: GEO.countriesInBBox,
  loadCountries: GEO.loadCountries,
  FLAGS: FLAGS.FLAGS,
};
