'use strict';
const D = require('../engine/lib/draw');
const MK = require('../engine/lib/mask');

// Authentic hand-colored vintage atlas palette
const PALETTE = {
  ink: '#26201c',
  ocean: '#cde0e6',
  oceanShallow: '#bad3dc',
  oceanDeep: '#8db0bf',
  graticule: '#89a7b5',
  neighborLand: '#ded8c6',
  land: '#f3e8cc',
  landWarm: '#efe0bc',
  landGreen: '#dfead0',
  mountain: '#b89f82',
  mountainLight: '#d8c7ad',
  snow: '#fcfaf2',
  river: '#5d93b3',
  lake: '#8abbd4',
  forest: '#8cb076',
  forestDark: '#5e834e',
  sakura: '#f2b8c6',
  vermilion: '#d65340',
  crimson: '#b8372e',
  ochre: '#e0ad48',
  terracotta: '#c97855',
  navy: '#354f66',
  cream: '#faf4e6',
  paper: '#fbf7ee',
  wood: '#b8895a',
  gold: '#e8c160',
  slate: '#8c9ea8',
  matcha: '#7fa858',
  orange: '#e07a2f',
  brown: '#8c5a3c',
};

const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const at = (x, y, s = 1, a = 0) => (pts) => pts.map((p) => {
  const q = rot([p[0] * s, p[1] * s], a);
  return [x + q[0], y + q[1]];
});

function part(P, poly, color, o = {}) {
  P.paper([poly], { clip: o.clip, cut: o.cut });
  if (color) {
    P.colour([poly], color, {
      pressure: o.pressure ?? 0.72,
      passes: o.passes ?? 2,
      angle: o.angle ?? 35,
      clip: o.clip,
      cut: o.cut,
      blunt: o.blunt,
    });
  }
  if (o.shade) {
    P.hatch([poly], { clip: [o.shade], angle: o.hatch ?? 70, pitch: o.pitch ?? 0.75, nib: 0.09 });
  }
  if (o.outline !== false) {
    P.outline([poly], { nib: o.nib ?? 0.22, clip: o.clip, cut: o.cut, color: o.outlineColor });
  }
}

// Oblique / Conic-like geographic projection from (lon, lat) -> [x, y] mm
function createProjection(o = {}) {
  const lon0 = o.lon0 ?? 137.6;
  const lat0 = o.lat0 ?? 38.2;
  const cx = o.cx ?? 160;
  const cy = o.cy ?? 100;
  const scale = o.scale ?? 0.140;
  const a = ((o.rotDeg ?? 26) * Math.PI) / 180;

  const fn = (lon, lat) => {
    const xk = (lon - lon0) * 111.32 * Math.cos((lat * Math.PI) / 180);
    const yk = -(lat - lat0) * 110.57;
    const xr = xk * Math.cos(a) - yk * Math.sin(a);
    const yr = xk * Math.sin(a) + yk * Math.cos(a);
    return [cx + xr * scale, cy + yr * scale];
  };
  fn.pts = (arr) => arr.map(([lon, lat]) => fn(lon, lat));
  fn.northAngle = (lon, lat) => {
    const p0 = fn(lon, lat);
    const p1 = fn(lon, lat + 0.5);
    return Math.atan2(p1[0] - p0[0], -(p1[1] - p0[1]));
  };
  return fn;
}

// Fast paper-tooth-preserving watercolor/tinted-paper wash (500x faster than 1,200 pencil strokes for oceans!)
function wash(P, polys, hexColor, o = {}) {
  const { hexToRgb } = require('../engine/kit/util');
  const col = hexToRgb(hexColor);
  const strength = o.strength ?? 0.76;
  const toothAmt = o.toothAmt ?? 0.35;
  const m = o.mask || MK.maskOf(P.S, polys);
  const bb = MK.bboxOf(P.S, m);
  if (!bb) return m;
  const { W, rgb, tooth, paper0 } = P.S;
  for (let y = bb.y0; y <= bb.y1; y++) {
    const row = y * W;
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = row + x;
      if (!m[i]) continue;
      const j = 3 * i;
      if (o.reset) {
        rgb[j] = paper0[j]; rgb[j + 1] = paper0[j + 1]; rgb[j + 2] = paper0[j + 2];
      }
      // Modulate wash by paper fibre height so crests stay slightly brighter and valleys hold pigment!
      const t = tooth[i];
      const a = strength * (1 - toothAmt * (t - 0.5));
      rgb[j] += (col[0] - rgb[j]) * a;
      rgb[j + 1] += (col[1] - rgb[j + 1]) * a;
      rgb[j + 2] += (col[2] - rgb[j + 2]) * a;
    }
  }
  return m;
}

// Fill ocean background inside frame in ~5ms while preserving full paper fibre texture!
function drawOcean(P, { pad = 5, color = PALETTE.ocean } = {}) {
  const rect = [[pad, pad], [P.w - pad, pad], [P.w - pad, P.h - pad], [pad, P.h - pad]];
  wash(P, [rect], color, { strength: 0.82, toothAmt: 0.38 });
}

// Clip a polyline to rectangular box [x0, y0, x1, y1] and return visible runs + border crossings
function clipRuns(pts, x0, y0, x1, y1) {
  const inside = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const runs = [];
  let cur = [];
  for (const p of pts) {
    if (inside(p)) cur.push(p);
    else {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

// Draw curved latitude/longitude graticule grid across the map + return edge label positions
function drawGraticule(P, proj, o = {}) {
  const inner = o.inner ?? 8.4;
  const x0 = inner, y0 = inner, x1 = P.w - inner, y1 = P.h - inner;
  const lons = o.lons || [126, 130, 134, 138, 142, 146];
  const lats = o.lats || [30, 34, 38, 42, 46];
  const ticks = [];

  for (const lon of lons) {
    const raw = [];
    for (let lat = 26; lat <= 50; lat += 0.35) raw.push(proj(lon, lat));
    for (const run of clipRuns(raw, x0, y0, x1, y1)) {
      P.ink(run, { nib: 0.1, color: PALETTE.graticule, tremor: 0.25 });
      const first = run[0], last = run[run.length - 1];
      if (Math.abs(first[1] - y1) < 3.5) ticks.push({ x: first[0], y: y1 - 1.2, text: `${lon}°E`, side: 'bottom' });
      if (Math.abs(last[1] - y0) < 3.5) ticks.push({ x: last[0], y: y0 + 2.8, text: `${lon}°E`, side: 'top' });
    }
  }
  for (const lat of lats) {
    const raw = [];
    for (let lon = 122; lon <= 152; lon += 0.35) raw.push(proj(lon, lat));
    for (const run of clipRuns(raw, x0, y0, x1, y1)) {
      P.ink(run, { nib: 0.1, color: PALETTE.graticule, tremor: 0.25 });
      const first = run[0], last = run[run.length - 1];
      if (Math.abs(first[0] - x0) < 3.5) ticks.push({ x: x0 + 1.4, y: first[1] + 0.8, text: `${lat}°N`, side: 'left' });
      if (Math.abs(last[0] - x1) < 3.5) ticks.push({ x: x1 - 1.4, y: last[1] + 0.8, text: `${lat}°N`, side: 'right' });
    }
  }
  return ticks;
}

// Morphological antique-atlas coastal shallow tint + double concentric waterlines!
function drawCoastWaterlines(P, polys, o = {}) {
  const m = MK.maskOf(P.S, polys);
  const r1 = MK.dilate(P.S, m, o.r1 ?? 1.4);
  const r2 = MK.dilate(P.S, m, o.r2 ?? 2.8);
  const collar = new Uint8Array(r1.length);
  for (let i = 0; i < r1.length; i++) collar[i] = r1[i] && !m[i] ? 1 : 0;
  wash(P, [], o.shallowColor || PALETTE.oceanShallow, { mask: collar, strength: 0.65, toothAmt: 0.35 });
  MK.outline(P.S, P.pen(0.12, '#6994a8'), r1, { tremor: 0.45 });
  MK.outline(P.S, P.pen(0.09, '#88aebf'), r2, { dash: 4.2, gap: 1.8 });
}

// Hand-drawn crinkled landmass (lower tension preserves real bays & peninsulas!)
function drawLand(P, ctrlPts, o = {}) {
  const poly = D.curve(ctrlPts, true, o.tension ?? 0.22);
  part(P, poly, o.color || PALETTE.land, {
    pressure: o.pressure ?? 0.62,
    passes: o.passes ?? 2,
    blunt: true,
    nib: o.nib ?? 0.30,
    outlineColor: o.outlineColor || PALETTE.ink,
    clip: o.clip,
  });
  return poly;
}

// Classic Cartographic Zebra Neatline Border + Graticule Labels + Corner Rosettes (batched into 2 masks!)
function drawZebraBorder(P, o = {}) {
  const { w, h } = P;
  const pad = o.pad ?? 4.8;
  const inner = o.inner ?? 8.0;

  // Clean paper margin around all 4 edges
  P.paper([
    [[0, 0], [w, 0], [w, inner], [0, inner]],
    [[0, h - inner], [w, h - inner], [w, h], [0, h]],
    [[0, 0], [inner, 0], [inner, h], [0, h]],
    [[w - inner, 0], [w, 0], [w, h], [w - inner, h]],
  ]);

  // Batch all dark and cream zebra bars into just 2 masks instead of 160 individual paint calls!
  const band = inner - pad;
  const step = o.step ?? 12;
  const darkBars = [], creamBars = [], ticks = [];
  for (let i = 0, x = inner; x < w - inner - 0.1; x += step, i++) {
    const x2 = Math.min(w - inner, x + step);
    const arr = i % 2 === 0 ? darkBars : creamBars;
    arr.push([[x, pad], [x2, pad], [x2, pad + band * 0.58], [x, pad + band * 0.58]]);
    arr.push([[x, h - pad - band * 0.58], [x2, h - pad - band * 0.58], [x2, h - pad], [x, h - pad]]);
    ticks.push([[x, pad], [x, inner]], [[x, h - inner], [x, h - pad]]);
  }
  for (let i = 0, y = inner; y < h - inner - 0.1; y += step, i++) {
    const y2 = Math.min(h - inner, y + step);
    const arr = i % 2 === 0 ? darkBars : creamBars;
    arr.push([[pad, y], [pad + band * 0.58, y], [pad + band * 0.58, y2], [pad, y2]]);
    arr.push([[w - pad - band * 0.58, y], [w - pad, y], [w - pad, y2], [w - pad - band * 0.58, y2]]);
    ticks.push([[pad, y], [inner, y]], [[w - inner, y], [w - pad, y]]);
  }
  wash(P, creamBars, PALETTE.cream, { strength: 0.85 });
  wash(P, darkBars, PALETTE.ink, { strength: 0.88, toothAmt: 0.45 });
  for (const [a, b] of ticks) P.ink([a, b], { nib: 0.14, color: PALETTE.ink });
  P.ink([[pad, pad + band * 0.58], [w - pad, pad + band * 0.58]], { nib: 0.14, color: PALETTE.ink });
  P.ink([[pad, h - pad - band * 0.58], [w - pad, h - pad - band * 0.58]], { nib: 0.14, color: PALETTE.ink });
  P.ink([[pad + band * 0.58, pad], [pad + band * 0.58, h - pad]], { nib: 0.14, color: PALETTE.ink });
  P.ink([[w - pad - band * 0.58, pad], [w - pad - band * 0.58, h - pad]], { nib: 0.14, color: PALETTE.ink });

  // Outer & inner crisp neatlines
  P.ink([[pad, pad], [w - pad, pad], [w - pad, h - pad], [pad, h - pad], [pad, pad]], { nib: 0.36, color: PALETTE.ink });
  P.ink([[inner, inner], [w - inner, inner], [w - inner, h - inner], [inner, h - inner], [inner, inner]], { nib: 0.24, color: PALETTE.ink });

  // Corner ochre blocks
  for (const [x0, y0] of [[pad, pad], [w - inner, pad], [pad, h - inner], [w - inner, h - inner]]) {
    part(P, [[x0, y0], [x0 + band, y0], [x0 + band, y0 + band], [x0, y0 + band]], PALETTE.ochre, { nib: 0.18 });
    P.dot(x0 + band / 2, y0 + band / 2, 0.55, PALETTE.ink);
  }

  // Graticule degree labels tucked cleanly just inside the neatline
  for (const t of o.ticks || []) {
    if (t.x < inner + 10 || t.x > w - inner - 10) {
      if (t.side === 'top' || t.side === 'bottom') continue;
    }
    if (t.y < inner + 8 || t.y > h - inner - 8) {
      if (t.side === 'left' || t.side === 'right') continue;
    }
    const align = t.side === 'left' ? 'left' : t.side === 'right' ? 'right' : 'center';
    P.text(t.text, t.x, t.y, { face: 'sans-bold', size: 1.85, align, color: '#456473' });
  }
}

// Overlapping jagged mountain range chain
function drawMountainRange(P, peaks, o = {}) {
  for (const [cx, by, w, h, snow] of peaks) {
    const body = [[cx - w, by], [cx - w * 0.45, by - h * 0.52], [cx, by - h], [cx + w * 0.48, by - h * 0.48], [cx + w, by]];
    part(P, body, o.color || PALETTE.mountainLight, {
      pressure: 0.55,
      passes: 1,
      nib: 0.16,
      shade: [[cx, by - h - 1], [cx + w + 1, by - h - 1], [cx + w + 1, by + 1], [cx, by + 1]],
      hatch: 58,
      pitch: 0.58,
    });
    P.ink([[cx, by - h], [cx - w * 0.08, by - h * 0.42], [cx + w * 0.1, by - h * 0.08]], { nib: 0.11 });
    if (snow) {
      const cap = [[cx, by - h], [cx + w * 0.32, by - h * 0.62], [cx + w * 0.1, by - h * 0.52], [cx - w * 0.12, by - h * 0.64], [cx - w * 0.32, by - h * 0.62]];
      part(P, cap, PALETTE.snow, { nib: 0.11, pressure: 0.35, passes: 1 });
    }
  }
}

// Terraced green rice paddy fields
function drawRiceFields(P, cx, cy, w = 14, h = 6) {
  const poly = D.curve([[cx - w / 2, cy], [cx - w * 0.3, cy - h / 2], [cx + w * 0.3, cy - h * 0.45], [cx + w / 2, cy + 0.8], [cx + w * 0.2, cy + h / 2], [cx - w * 0.35, cy + h * 0.45]]);
  part(P, poly, '#b8d18a', { nib: 0.14, pressure: 0.65 });
  for (let i = -2; i <= 2; i++) {
    const yy = cy + i * (h * 0.18);
    P.curve([[cx - w * 0.38, yy], [cx, yy - 0.6], [cx + w * 0.38, yy + 0.3]], { nib: 0.09, color: '#587842' });
  }
}

// Gentle sea wave squiggles
function drawWaves(P, x, y, s = 1, count = 2) {
  for (let i = 0; i < count; i++) {
    const yy = y + i * 2.0 * s;
    const ox = i * 2.0 * s;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      pts.push([x + ox + t * 12 * s, yy + Math.sin(t * Math.PI * 3) * 0.68 * s]);
    }
    P.ink(pts, { nib: 0.12, color: '#6992a6' });
  }
}

// Winding river
function drawRiver(P, ctrlPts, o = {}) {
  P.curve(ctrlPts, { nib: o.nib ?? 0.42, color: o.color || PALETTE.river });
}

// Dashed railway / maritime route
function drawRoute(P, ctrlPts, o = {}) {
  const pts = D.resample(D.curve(ctrlPts, false, 0.35), 1.2);
  for (let i = 0; i < pts.length - 2; i += 3) {
    P.ink([pts[i], pts[i + 1]], { nib: o.nib ?? 0.18, color: o.color || PALETTE.crimson });
  }
}

// Delicate curved pointer line connecting an offshore vignette to its bay/region
function drawCallout(P, fromPt, toPt, o = {}) {
  const mx = (fromPt[0] + toPt[0]) / 2 + (o.bendX ?? 0);
  const my = (fromPt[1] + toPt[1]) / 2 + (o.bendY ?? -2.2);
  const pts = D.resample(D.curve([fromPt, [mx, my], toPt], false, 0.35), 1.0);
  for (let i = 0; i < pts.length - 1; i += 2) {
    P.ink([pts[i], pts[Math.min(pts.length - 1, i + 1)]], { nib: 0.11, color: o.color || '#6a5d52' });
  }
}

// City marker dot + crisp cartographic label
function drawCity(P, x, y, name, o = {}) {
  P.paper([D.ell(x, y, 1.25, 1.25)]);
  P.dot(x, y, o.capital ? 1.35 : 0.85, o.capital ? PALETTE.crimson : PALETTE.ink);
  if (o.capital) P.outline([D.ell(x, y, 2.0, 2.0)], { nib: 0.16, color: PALETTE.crimson });
  if (name) {
    const dx = o.dx ?? 0, dy = o.dy ?? -2.2;
    P.text(name, x + dx, y + dy, {
      face: o.capital ? 'serif-bold' : 'sans-bold',
      size: o.size ?? (o.capital ? 3.2 : 2.3),
      align: o.align ?? 'center',
      color: o.color || (o.capital ? PALETTE.crimson : PALETTE.ink),
    });
  }
}

// True-North Rotatable Vintage Compass Rose + Faint Rhumb Lines
function drawCompass(P, cx, cy, r = 9, o = {}) {
  const rotA = o.angle ?? 0;
  const T = at(cx, cy, 1, rotA);

  // Subtle nautical rhumb lines radiating softly in the sea behind compass
  if (o.rhumb !== false) {
    for (let i = 0; i < 8; i++) {
      const a = rotA + (i * Math.PI) / 4;
      P.ink([
        [cx + Math.cos(a) * (r * 1.35), cy + Math.sin(a) * (r * 1.35)],
        [cx + Math.cos(a) * (r * 2.9), cy + Math.sin(a) * (r * 2.9)],
      ], { nib: 0.08, color: '#8baabf' });
    }
  }

  P.paper([D.ell(cx, cy, r * 1.12, r * 1.12)]);
  P.outline([D.ell(cx, cy, r * 0.94, r * 0.94)], { nib: 0.15 });
  P.outline([D.ell(cx, cy, r * 0.78, r * 0.78)], { nib: 0.09 });

  // Secondary 4-point star
  const subStar = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 4 + (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? r * 0.72 : r * 0.22;
    subStar.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  part(P, T(subStar), PALETTE.slate, { nib: 0.12, pressure: 0.55 });

  // Main 4-point star
  const star = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? r * 1.05 : r * 0.26;
    star.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  part(P, T(star), PALETTE.ochre, { nib: 0.18, pressure: 0.75 });
  // Crimson North needle
  part(P, T([[0, -r * 1.06], [r * 0.2, -r * 0.22], [0, 0], [-r * 0.2, -r * 0.22]]), PALETTE.crimson, { nib: 0.15 });

  const [nx, ny] = T([[0, -r * 1.34]])[0];
  const [sx, sy] = T([[0, r * 1.42]])[0];
  const [ex, ey] = T([[r * 1.36, 0.6]])[0];
  const [wx, wy] = T([[-r * 1.38, 0.6]])[0];
  P.text('N', nx, ny + 1.0, { face: 'serif-bold', size: 3.1, align: 'center', color: PALETTE.crimson });
  P.text('S', sx, sy + 0.9, { face: 'serif-bold', size: 2.3, align: 'center' });
  P.text('E', ex, ey + 0.6, { face: 'serif-bold', size: 2.3, align: 'center' });
  P.text('W', wx, wy + 0.6, { face: 'serif-bold', size: 2.3, align: 'center' });
}

// Framed Parchment Map Title, Country Facts, Legend & Graphical Scale Cartouche
function drawCartouche(P, x, y, w, h, info = {}) {
  // Subtle drop shadow hatch
  P.hatch([D.rrect(x + 1.4, y + 1.4, x + w + 1.4, y + h + 1.4, 1.5)], { angle: 45, pitch: 0.65, nib: 0.1, color: '#5c5349' });
  // Parchment card + double inner hairline
  part(P, D.rrect(x, y, x + w, y + h, 1.5), PALETTE.cream, { nib: 0.28, pressure: 0.55 });
  P.outline([D.rrect(x + 1.5, y + 1.5, x + w - 1.5, y + h - 1.5, 1.0)], { nib: 0.12 });
  // Brass corner rivets
  for (const [rx, ry] of [[x + 3.0, y + 3.0], [x + w - 3.0, y + 3.0], [x + 3.0, y + h - 3.0], [x + w - 3.0, y + h - 3.0]]) {
    P.dot(rx, ry, 0.55, PALETTE.ochre);
  }

  // Country Title + Waving National Flag
  P.text(info.country || 'JAPAN', x + 5.5, y + 12.2, { face: 'serif-bold', size: 9.2, align: 'left', color: PALETTE.ink });
  if (info.flag === 'japan') {
    const fx = x + w - 20.5, fy = y + 4.4;
    const fpoly = D.curve([[fx, fy], [fx + 6.5, fy - 0.6], [fx + 13, fy + 0.4], [fx + 13, fy + 8.6], [fx + 6.5, fy + 7.8], [fx, fy + 8.6]]);
    part(P, fpoly, PALETTE.paper, { nib: 0.18, pressure: 0.35 });
    part(P, D.ell(fx + 6.5, fy + 4.1, 2.4, 2.4), PALETTE.crimson, { nib: 0.12, pressure: 0.9 });
  }
  if (info.subtitle) {
    P.italic(info.subtitle, x + 5.8, y + 16.4, { face: 'serif-bold', size: 2.7, align: 'left', color: PALETTE.crimson });
  }

  // Divider line
  P.ink([[x + 5, y + 18.6], [x + w - 5, y + 18.6]], { nib: 0.12, color: '#9c8e7b' });

  // Fact rows (left column) & Map Legend (right column)
  const facts = [
    `Capital: ${info.capital || 'Tokyo'}`,
    `Language: ${info.language || 'Japanese'}`,
    `Pop.: ${info.population || '124M'}`,
    `Area: ${info.area || '377,975 km2'}`,
  ];
  facts.forEach((txt, i) => {
    P.text(txt, x + 5.5, y + 23.0 + i * 4.2, { face: 'sans-bold', size: 2.25, align: 'left', color: PALETTE.ink });
  });

  // Legend on right side of cartouche
  const lx = x + w * 0.58;
  P.dot(lx, y + 22.2, 1.1, PALETTE.crimson);
  P.outline([D.ell(lx, y + 22.2, 1.7, 1.7)], { nib: 0.13, color: PALETTE.crimson });
  P.text('Capital', lx + 3.2, y + 23.0, { face: 'sans', size: 2.15, align: 'left' });

  P.dot(lx, y + 26.8, 0.8, PALETTE.ink);
  P.text('Major City', lx + 3.2, y + 27.5, { face: 'sans', size: 2.15, align: 'left' });

  P.ink([[lx - 2.0, y + 31.2], [lx - 0.3, y + 31.2]], { nib: 0.2, color: PALETTE.navy });
  P.ink([[lx + 0.7, y + 31.2], [lx + 2.2, y + 31.2]], { nib: 0.2, color: PALETTE.navy });
  P.text('Shinkansen', lx + 3.2, y + 31.9, { face: 'sans', size: 2.15, align: 'left' });

  // Graphical Scale Bar across bottom of cartouche
  const sy = y + h - 5.2, sx0 = x + 6;
  const seg = 11.5; // ~100 km at scale 0.140 -> 14 mm per 100 km! Let's make 14mm = 100km!
  const km100 = info.mmPer100km ?? 14.0;
  for (let k = 0; k < 3; k++) {
    const bx = sx0 + k * km100;
    part(P, [[bx, sy], [bx + km100, sy], [bx + km100, sy + 1.4], [bx, sy + 1.4]], k % 2 === 0 ? PALETTE.ink : PALETTE.paper, { nib: 0.12 });
    P.text(String(k * 100), bx, sy - 0.8, { face: 'sans', size: 1.85, align: 'center' });
  }
  P.text('300 km', sx0 + 3 * km100, sy - 0.8, { face: 'sans-bold', size: 1.85, align: 'center' });
}

// Framed Inset Map Box (e.g., Ryukyu / Okinawa Islands)
function drawInsetBox(P, x, y, w, h, title) {
  const box = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  wash(P, [box], PALETTE.ocean, { reset: true, strength: 0.82, toothAmt: 0.38 });
  P.ink([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], { nib: 0.3, color: PALETTE.ink });
  P.ink([[x + 1.1, y + 1.1], [x + w - 1.1, y + 1.1], [x + w - 1.1, y + h - 1.1], [x + 1.1, y + h - 1.1], [x + 1.1, y + 1.1]], { nib: 0.12, color: PALETTE.ink });
  if (title) {
    const tw = Math.min(w - 6, title.length * 1.9 + 6);
    part(P, D.rrect(x + 2.5, y + 2.2, x + 2.5 + tw, y + 7.2, 0.8), PALETTE.cream, { nib: 0.16 });
    P.text(title, x + 2.5 + tw / 2, y + 5.5, { face: 'serif-bold', size: 2.3, align: 'center' });
  }
  return box;
}

module.exports = {
  PALETTE,
  at,
  part,
  createProjection,
  drawOcean,
  drawGraticule,
  drawCoastWaterlines,
  drawLand,
  drawZebraBorder,
  drawMountainRange,
  drawRiceFields,
  drawWaves,
  drawRiver,
  drawRoute,
  drawCallout,
  drawCity,
  drawCompass,
  drawCartouche,
  drawInsetBox,
};
