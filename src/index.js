'use strict';
const { plate } = require('../engine/lib/storybook');
const { person, POSES } = require('../engine/lib/people');
const D = require('../engine/lib/draw');
const M = require('./mapPrimitives');
const EL = require('./elements');

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

module.exports = { createMap, createProjection: M.createProjection, PALETTE: M.PALETTE, POSES };
