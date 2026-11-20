'use strict';
// Small waving national flags for the cartouche. A flag is described in "flag units": a 13 x 8.4
// box with (0, 0) at its top-left corner. Use a built-in by country code / name, pass your own
// spec ({ type: 'stripes' | 'disc' | 'cross' | 'star', ... }), or a function (F) => { ... } that draws with
// F.fill(poly, color), F.line(pts, color, nib), F.W and F.H.
const D = require('../engine/lib/draw');
const GEO = require('./geo');

const FW = 13, FH = 8.4;
const WHITE = '#fbf7ee', RED = '#b8372e', BLUE = '#2f4f8f', NAVY = '#27386b', GREEN = '#3f7d4e', YELLOW = '#e8c160';
const BLACK = '#26201c', ORANGE = '#e07a2f', SKY = '#7fb2d9';

const h3 = (...colors) => ({ type: 'stripes', dir: 'h', colors });
const v3 = (...colors) => ({ type: 'stripes', dir: 'v', colors });
const cross = (field, color, inner) => ({ type: 'cross', field, color, inner });

function taegeukgi(F) {
  F.field(WHITE);
  const cx = FW / 2, cy = FH / 2, R = FH / 4;
  const th = Math.atan2(FH, FW);
  const d = [Math.cos(th), Math.sin(th)], n = [Math.sin(th), -Math.cos(th)];
  const pt = (ox, r, a, sn) => [
    cx + d[0] * ox + r * (Math.cos(a) * d[0] + sn * Math.sin(a) * n[0]),
    cy + d[1] * ox + r * (Math.cos(a) * d[1] + sn * Math.sin(a) * n[1]),
  ];
  const arc = (ox, r, a0, a1, sn, k = 14) => Array.from({ length: k + 1 }, (_, i) => pt(ox, r, a0 + ((a1 - a0) * i) / k, sn));
  // Blue disc, then the red half with its head toward the hoist
  F.fill(D.ell(cx, cy, R, R), BLUE, { nib: 0.1 });
  F.fill([...arc(0, R, Math.PI, 0, 1, 24), ...arc(R / 2, R / 2, 0, Math.PI, 1), ...arc(-R / 2, R / 2, 0, Math.PI, -1)], RED, { outline: false });
  // Four trigrams on the diagonals: 1 = solid bar, 0 = broken bar (listed from the centre outward)
  const bars = [
    [-1, -1, [1, 1, 1]], // geon (heaven), upper hoist
    [1, 1, [0, 0, 0]], // gon (earth), lower fly
    [1, -1, [0, 1, 0]], // gam (water), upper fly
    [-1, 1, [1, 0, 1]], // ri (fire), lower hoist
  ];
  for (const [sx, sy, rows] of bars) {
    const ux = sx * d[0], uy = sy * d[1]; // outward along the diagonal
    const px = -uy, py = ux; // along the bar
    rows.forEach((solid, i) => {
      const r = R * (1.55 + i * 0.27);
      const mx = cx + ux * r, my = cy + uy * r;
      const seg = (a, b) => F.line([[mx + px * a, my + py * a], [mx + px * b, my + py * b]], BLACK, 0.3);
      if (solid) seg(-R / 2, R / 2);
      else { seg(-R / 2, -R * 0.09); seg(R * 0.09, R / 2); }
    });
  }
}

function fiveStars(F) {
  F.field(RED);
  F.fill(star(2.6, 2.6, 1.55), YELLOW, { outline: false });
  for (const [x, y] of [[5.2, 0.9], [6.3, 2.0], [6.3, 3.6], [5.2, 4.7]]) F.fill(star(x, y, 0.55), YELLOW, { outline: false });
}

// Keyed by Natural Earth / ISO three-letter code
const FLAGS = {
  JPN: { type: 'disc', field: WHITE, color: RED, r: 2.4 },
  BGD: { type: 'disc', field: GREEN, color: RED, r: 2.6, cx: 5.9 },
  PLW: { type: 'disc', field: SKY, color: YELLOW, r: 2.5, cx: 5.9 },
  KOR: taegeukgi,
  CHN: fiveStars,
  VNM: { type: 'star', field: RED, color: YELLOW },
  SOM: { type: 'star', field: SKY, color: WHITE },
  FRA: v3(BLUE, WHITE, RED),
  ITA: v3(GREEN, WHITE, RED),
  IRL: v3(GREEN, WHITE, ORANGE),
  BEL: v3(BLACK, YELLOW, RED),
  ROU: v3(NAVY, YELLOW, RED),
  NGA: v3(GREEN, WHITE, GREEN),
  PER: v3(RED, WHITE, RED),
  DEU: h3(BLACK, RED, YELLOW),
  NLD: h3(RED, WHITE, BLUE),
  LUX: h3(RED, WHITE, SKY),
  RUS: h3(WHITE, BLUE, RED),
  AUT: h3(RED, WHITE, RED),
  HUN: h3(RED, WHITE, GREEN),
  BGR: h3(WHITE, GREEN, RED),
  EST: h3(BLUE, BLACK, WHITE),
  LTU: h3(YELLOW, GREEN, RED),
  YEM: h3(RED, WHITE, BLACK),
  POL: h3(WHITE, RED),
  IDN: h3(RED, WHITE),
  MCO: h3(RED, WHITE),
  UKR: h3(SKY, YELLOW),
  THA: { type: 'stripes', dir: 'h', colors: [RED, WHITE, NAVY, WHITE, RED], weights: [1, 1, 2, 1, 1] },
  SWE: cross(BLUE, YELLOW),
  DNK: cross(RED, WHITE),
  FIN: cross(WHITE, BLUE),
  NOR: cross(RED, WHITE, NAVY),
  ISL: cross(BLUE, WHITE, RED),
};

function star(cx, cy, r, points = 5) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? r : r * 0.4;
    out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return out;
}

function drawSpec(F, spec) {
  if (spec.type === 'disc') {
    F.field(spec.field ?? WHITE);
    F.fill(D.ell(spec.cx ?? FW / 2, spec.cy ?? FH / 2, spec.r ?? 2.4, spec.r ?? 2.4), spec.color, { nib: 0.12, pressure: 0.9, clip: false });
  } else if (spec.type === 'stripes') {
    const weights = spec.weights || spec.colors.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    F.field(spec.colors[0]);
    let t = 0;
    spec.colors.forEach((color, i) => {
      const a = t / total, b = (t += weights[i]) / total;
      if (i === 0) return;
      // Bleed past the box so the wavy outline, not the stripe, forms the outer edge
      const lo = (v) => (v <= 0 ? -2 : v), hi = (v) => (v >= 1 ? 2 : v);
      F.fill(spec.dir === 'v'
        ? [[FW * a, -2], [FW * hi(b), -2], [FW * hi(b), FH + 2], [FW * a, FH + 2]]
        : [[-2, FH * lo(a)], [FW + 2, FH * lo(a)], [FW + 2, FH * hi(b)], [-2, FH * hi(b)]], color, { outline: false });
    });
    F.edge();
  } else if (spec.type === 'cross') {
    F.field(spec.field);
    const bar = (w, color) => {
      F.fill([[-2, FH / 2 - w], [FW + 2, FH / 2 - w], [FW + 2, FH / 2 + w], [-2, FH / 2 + w]], color, { outline: false });
      F.fill([[4.6 - w, -2], [4.6 + w, -2], [4.6 + w, FH + 2], [4.6 - w, FH + 2]], color, { outline: false });
    };
    bar(1.0, spec.color);
    if (spec.inner) bar(0.5, spec.inner);
    F.edge();
  } else if (spec.type === 'star') {
    F.field(spec.field);
    F.fill(star(spec.cx ?? FW / 2, spec.cy ?? FH / 2 + 0.2, spec.r ?? 2.3), spec.color, { outline: false });
  } else {
    throw new Error(`Unknown flag type "${spec.type}"`);
  }
}

function resolveFlag(flag) {
  if (typeof flag !== 'string') return flag;
  const country = GEO.findCountry(flag);
  const spec = FLAGS[country ? country.id : flag.toUpperCase()];
  if (!spec) {
    throw new Error(`No built-in flag for "${flag}". Pass a flag spec or a draw function instead (built-in: ${Object.keys(FLAGS).join(', ')}).`);
  }
  return spec;
}

// Draw `flag` (country code / name, spec object, or function) with its top-left corner at (x, y) mm
function drawFlag(P, part, flag, x, y, o = {}) {
  const spec = resolveFlag(flag);
  const s = o.scale ?? 1;
  const at = (pts) => pts.map(([px, py]) => [x + px * s, y - 0.1 * s + py * s]);
  // Gently waving outline around the flag box
  const cloth = D.curve([[0, 0], [6.5, -0.6], [13, 0.4], [13, 8.6], [6.5, 7.8], [0, 8.6]].map(([px, py]) => [x + px * s, y + py * s]));
  const F = {
    W: FW,
    H: FH,
    field: (color) => part(P, cloth, color, { nib: 0.18, pressure: color === WHITE ? 0.35 : 0.8 }),
    fill: (poly, color, fo = {}) => part(P, at(poly), color, { nib: 0.1, pressure: 0.85, ...fo, clip: fo.clip === false ? undefined : [cloth] }),
    line: (pts, color, nib = 0.2) => P.ink(at(pts), { nib: nib * s, color, tremor: 0.2 }),
    edge: () => P.outline([cloth], { nib: 0.18 }),
  };
  if (typeof spec === 'function') spec(F);
  else drawSpec(F, spec);
}

module.exports = { drawFlag, resolveFlag, FLAGS, star };
