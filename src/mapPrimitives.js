'use strict';
const D = require('../engine/lib/draw');
const MK = require('../engine/lib/mask');
const Lt = require('../engine/lib/letter');
const { drawFlag } = require('./flags');

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

const KM_PER_DEG_LON = 111.32;
const KM_PER_DEG_LAT = 110.57;

// Oblique / Conic-like geographic projection from (lon, lat) -> [x, y] mm
function createProjection(o = {}) {
  const lon0 = o.lon0 ?? 137.6;
  const lat0 = o.lat0 ?? 38.2;
  const cx = o.cx ?? 160;
  const cy = o.cy ?? 100;
  const scale = o.scale ?? 0.140;
  const a = ((o.rotDeg ?? 26) * Math.PI) / 180;

  const wrap = (dLon) => (dLon > 180 ? dLon - 360 : dLon < -180 ? dLon + 360 : dLon);
  const project = (dLon, lat) => {
    const xk = dLon * KM_PER_DEG_LON * Math.cos((lat * Math.PI) / 180);
    const yk = -(lat - lat0) * KM_PER_DEG_LAT;
    const xr = xk * Math.cos(a) - yk * Math.sin(a);
    const yr = xk * Math.sin(a) + yk * Math.cos(a);
    return [cx + xr * scale, cy + yr * scale];
  };
  const fn = (lon, lat) => project(wrap(lon - lon0), lat);
  fn.pts = (arr) => arr.map(([lon, lat]) => fn(lon, lat));
  // Project a closed ring as one piece: every vertex gets the same 360° shift, so a ring lying across
  // the far side of the globe from lon0 stays whole (and off the sheet) instead of being torn in two
  fn.ring = (arr) => {
    let lo = Infinity, hi = -Infinity;
    for (const [lon] of arr) {
      if (lon < lo) lo = lon;
      if (lon > hi) hi = lon;
    }
    const mid = (lo + hi) / 2 - lon0;
    const shift = wrap(((mid % 360) + 540) % 360 - 180) - mid;
    return arr.map(([lon, lat]) => project(lon - lon0 + shift, lat));
  };
  // [x, y] mm -> [lon, lat]
  fn.inverse = (x, y) => {
    const xr = (x - cx) / scale, yr = (y - cy) / scale;
    const xk = xr * Math.cos(a) + yr * Math.sin(a);
    const yk = -xr * Math.sin(a) + yr * Math.cos(a);
    const lat = Math.max(-89.9, Math.min(89.9, lat0 - yk / KM_PER_DEG_LAT));
    return [lon0 + xk / (KM_PER_DEG_LON * Math.cos((lat * Math.PI) / 180)), lat];
  };
  fn.northAngle = (lon, lat) => {
    const p0 = fn(lon, lat);
    const p1 = fn(lon, lat + 0.5);
    return Math.atan2(p1[0] - p0[0], -(p1[1] - p0[1]));
  };
  // [west, south, east, north] visible inside the mm rectangle [x0, y0, x1, y1]
  fn.extent = ([x0, y0, x1, y1]) => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (let i = 0; i <= 12; i++) {
      for (let j = 0; j <= 12; j++) {
        const [lon, lat] = fn.inverse(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * j) / 12);
        if (lon < w) w = lon;
        if (lon > e) e = lon;
        if (lat < s) s = lat;
        if (lat > n) n = lat;
      }
    }
    return [w, s, e, n];
  };
  fn.mmPerKm = scale;
  fn.params = { lon0, lat0, cx, cy, scale, rotDeg: o.rotDeg ?? 26 };
  return fn;
}

// Projection that fits the geographic box [west, south, east, north] inside the mm rectangle
// `frame` = [x0, y0, x1, y1], centred, at the largest scale that still shows the whole box.
function fitProjection(bbox, o = {}) {
  const [w, s, e, n] = bbox;
  const [x0, y0, x1, y1] = o.frame;
  const rotDeg = o.rotDeg ?? 0;
  const unit = createProjection({ lon0: (w + e) / 2, lat0: (s + n) / 2, cx: 0, cy: 0, scale: 1, rotDeg });
  let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    for (const [lon, lat] of [[w + (e - w) * t, s], [w + (e - w) * t, n], [w, s + (n - s) * t], [e, s + (n - s) * t]]) {
      const [x, y] = unit(lon, lat);
      if (x < ax) ax = x;
      if (x > bx) bx = x;
      if (y < ay) ay = y;
      if (y > by) by = y;
    }
  }
  const scale = (o.zoom ?? 1) * Math.min((x1 - x0) / (bx - ax), (y1 - y0) / (by - ay));
  return createProjection({
    lon0: (w + e) / 2,
    lat0: (s + n) / 2,
    cx: (x0 + x1) / 2 - ((ax + bx) / 2) * scale,
    cy: (y0 + y1) / 2 - ((ay + by) / 2) * scale,
    scale,
    rotDeg,
  });
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

// Clip a polyline to rectangular box [x0, y0, x1, y1]; runs start and end exactly on the box edge
function clipRuns(pts, x0, y0, x1, y1) {
  const inside = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  // Point where segment a (inside) -> b (outside) leaves the box
  const exit = (a, b) => {
    let t = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (b[0] < x0) t = Math.min(t, (x0 - a[0]) / dx);
    if (b[0] > x1) t = Math.min(t, (x1 - a[0]) / dx);
    if (b[1] < y0) t = Math.min(t, (y0 - a[1]) / dy);
    if (b[1] > y1) t = Math.min(t, (y1 - a[1]) / dy);
    return [a[0] + dx * t, a[1] + dy * t];
  };
  const runs = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], prev = pts[i - 1];
    if (inside(p)) {
      if (!cur.length && prev) cur.push(exit(p, prev));
      cur.push(p);
    } else {
      if (cur.length) {
        cur.push(exit(prev, p));
        runs.push(cur);
      }
      cur = [];
    }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

// Clip a closed ring to the box [x0, y0, x1, y1] (Sutherland–Hodgman)
function clipRing(ring, x0, y0, x1, y1) {
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = ring;
  for (const [keep, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      const ka = keep(a), kb = keep(b);
      if (ka) out.push(a);
      if (ka !== kb) out.push(cut(a, b));
    }
    if (out.length < 3) return [];
  }
  return out;
}

function ringAreaMm(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

// Drop vertices closer than `tol` mm to the line between their kept neighbours (Douglas–Peucker)
function simplifyRing(ring, tol) {
  const n = ring.length;
  if (n < 5 || !(tol > 0)) return ring;
  // Anchor on the vertex farthest from the first one so both halves are open polylines
  let far = 1, farD = -1;
  for (let i = 1; i < n; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  const keep = new Uint8Array(n + 1);
  keep[0] = keep[far] = keep[n] = 1;
  const at = (i) => ring[i % n];
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const a = at(i0), b = at(i1);
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    let worst = -1, worstD = tol * tol;
    for (let i = i0 + 1; i < i1; i++) {
      const p = at(i);
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
      const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([i0, worst], [worst, i1]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : ring;
}

// Project (lon, lat) polygons — each a list of rings, outer ring first — to hand-drawable mm rings.
// Rings are clipped to the sheet, simplified, smoothed, and islets smaller than `minArea` mm² dropped.
// Returns a flat list of rings: pass it to drawCoastWaterlines as-is, or to part() as one shape.
function geoRings(P, proj, polygons, o = {}) {
  const m = o.margin ?? 12;
  const [x0, y0, x1, y1] = o.frame || [-m, -m, P.w + m, P.h + m];
  const minArea = o.minArea ?? 0.5;
  const out = [];
  for (const poly of polygons) {
    for (let k = 0; k < poly.length; k++) {
      let ring = clipRing(proj.ring ? proj.ring(poly[k]) : proj.pts(poly[k]), x0, y0, x1, y1);
      if (ring.length < 3 || ringAreaMm(ring) < minArea) {
        if (k === 0) break; // no outer ring left, so its holes go too
        continue;
      }
      ring = simplifyRing(ring, o.simplify ?? 0.12);
      out.push(o.smooth === false || ring.length < 4 ? ring : D.curve(ring, true, o.step ?? 0.3));
    }
  }
  return out;
}

// Pick evenly spaced "nice" graticule values covering [lo, hi]
function niceSteps(lo, hi, step) {
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
function niceStep(span, maxLines = 8) {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 30, 45]) if (span / s <= maxLines) return s;
  return 60;
}

const degLabel = (v, pos, neg) => {
  const n = Math.round(Math.abs(v) * 100) / 100;
  return n === 0 || n === 180 ? `${n}°` : `${n}°${v > 0 ? pos : neg}`;
};

// Draw curved latitude/longitude graticule grid across the map + return edge label positions.
// `lons` / `lats` default to round values chosen from the area the projection shows on this sheet.
function drawGraticule(P, proj, o = {}) {
  const inner = o.inner ?? 8.4;
  const x0 = inner, y0 = inner, x1 = P.w - inner, y1 = P.h - inner;
  let [west, south, east, north] = proj.extent([x0, y0, x1, y1]);
  // Near the poles the sheet can show more than a full turn of longitude; draw each meridian once
  if (proj.params) {
    west = Math.max(west, proj.params.lon0 - 180);
    east = Math.min(east, proj.params.lon0 + 180);
  }
  const step = o.step ?? Math.max(niceStep(east - west), niceStep(north - south));
  const lons = o.lons || niceSteps(west, east, step);
  const lats = o.lats || niceSteps(Math.max(-85, south), Math.min(85, north), step);
  const ticks = [];
  const N = 160;

  for (const lon of lons) {
    const raw = [];
    for (let i = 0; i <= N; i++) raw.push(proj(lon, Math.max(-89, Math.min(89, south + ((north - south) * i) / N))));
    for (const run of clipRuns(raw, x0, y0, x1, y1)) {
      P.ink(run, { nib: 0.1, color: PALETTE.graticule, tremor: 0.25 });
      const text = degLabel(((((lon + 180) % 360) + 360) % 360) - 180, 'E', 'W'); // back into [-180, 180)
      for (const end of [run[0], run[run.length - 1]]) {
        if (Math.abs(end[1] - y1) < 0.5) ticks.push({ x: end[0], y: y1 - 1.2, text, side: 'bottom' });
        if (Math.abs(end[1] - y0) < 0.5) ticks.push({ x: end[0], y: y0 + 2.8, text, side: 'top' });
      }
    }
  }
  for (const lat of lats) {
    const raw = [];
    for (let i = 0; i <= N; i++) raw.push(proj(west + ((east - west) * i) / N, lat));
    for (const run of clipRuns(raw, x0, y0, x1, y1)) {
      P.ink(run, { nib: 0.1, color: PALETTE.graticule, tremor: 0.25 });
      const text = degLabel(lat, 'N', 'S');
      for (const end of [run[0], run[run.length - 1]]) {
        if (Math.abs(end[0] - x0) < 0.5) ticks.push({ x: x0 + 1.4, y: end[1] + 0.8, text, side: 'left' });
        if (Math.abs(end[0] - x1) < 0.5) ticks.push({ x: x1 - 1.4, y: end[1] + 0.8, text, side: 'right' });
      }
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
    const {
      capital,
      dx: optDx,
      dy: optDy,
      sub,
      bilingualLayout,
      layout: optLayout,
      subSize: optSubSize,
      subFace,
      subColor,
      ...typoOpts
    } = o;
    const size = o.size ?? (capital ? 3.2 : 2.3);
    const textOpts = {
      ...typoOpts,
      face: o.face || (capital ? 'serif-bold' : 'sans-bold'),
      size,
      align: o.align ?? 'center',
      color: o.color || (capital ? PALETTE.crimson : PALETTE.ink),
    };

    if (sub) {
      const layout = bilingualLayout || optLayout || 'stack';
      const subSize = o.secondarySize ?? optSubSize ?? size * 0.68;
      const defaultDy = layout === 'stack' ? -(2.2 + size * 0.35 + subSize * 1.05) : -2.2;
      const dx = optDx ?? 0, dy = optDy ?? defaultDy;
      return P.writeBilingual(name, sub, x + dx, y + dy, {
        ...textOpts,
        layout,
        secondarySize: subSize,
        ...(o.secondaryFace || subFace ? { secondaryFace: o.secondaryFace || subFace } : {}),
        ...(o.secondaryColor || subColor ? { secondaryColor: o.secondaryColor || subColor } : {}),
      });
    }

    const dx = optDx ?? 0, dy = optDy ?? -2.2;
    return P.text(name, x + dx, y + dy, textOpts);
  }
  return null;
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

const CARTOUCHE_LOCALE = {
  en: {
    facts: { capital: 'Capital', language: 'Language', population: 'Pop.', area: 'Area', sep: ': ' },
    legend: { capital: 'Capital', city: 'Major City', route: 'Railway' },
  },
  zh: {
    facts: { capital: '首都', language: '语言', population: '人口', area: '面积', sep: '：' },
    legend: { capital: '首都', city: '主要城市', route: '铁路' },
  },
  ja: {
    facts: { capital: '首都', language: '言語', population: '人口', area: '面積', sep: '：' },
    legend: { capital: '首都', city: '主要都市', route: '鉄道' },
  },
  ko: {
    facts: { capital: '수도', language: '언어', population: '인구', area: '면적', sep: ': ' },
    legend: { capital: '수도', city: '주요 도시', route: '철도' },
  },
};

// Fit text into maxW mm by scaling down to minSize, then truncating cleanly with '…' if still wider
function fitTextToWidth(text, face, baseSize, maxW, minSize) {
  const str = String(text ?? '');
  if (!str || maxW <= 0) return { text: str, size: baseSize };
  const measured = Lt.measure(str, face, baseSize);
  if (measured <= maxW || measured <= 0) return { text: str, size: baseSize };

  const scaled = baseSize * (maxW / measured);
  if (scaled >= minSize) {
    return { text: str, size: scaled };
  }

  const chars = [...str];
  const ell = '…';
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const cand = chars.slice(0, mid).join('') + ell;
    if (Lt.measure(cand, face, minSize) <= maxW) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const fitted = lo > 0 ? chars.slice(0, lo).join('') + ell : ell;
  const fittedW = Lt.measure(fitted, face, minSize);
  const finalSize = fittedW > maxW && fittedW > 0 ? minSize * (maxW / fittedW) : minSize;
  return { text: fitted, size: finalSize };
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

  // Country Title + Waving National Flag (auto-scale/truncate title so CJK/long titles never collide with flag)
  if (info.country) {
    const baseTitleSize = info.titleSize ?? 9.2;
    const maxTitleW = info.flag ? Math.max(4, w - 28.0) : Math.max(4, w - 11.0);
    const { text: fittedTitle, size: titleSize } = fitTextToWidth(info.country, 'serif-bold', baseTitleSize, maxTitleW, 1.8);
    P.text(fittedTitle, x + 5.5, y + 12.2, { face: 'serif-bold', size: titleSize, align: 'left', color: PALETTE.ink });
  }
  if (info.flag) drawFlag(P, part, info.flag, x + w - 20.5, y + 4.4);

  // Subtitle (with optional bilingual secondary via info.subtitleSub or info.sub)
  const maxSubW = Math.max(4, w - 11.6);
  const secondarySub = info.subtitleSub || info.sub;
  if (info.subtitle && secondarySub) {
    const sep = '  ·  ';
    const combined = `${info.subtitle}${sep}${secondarySub}`;
    const { text: fittedSub, size: subSize } = fitTextToWidth(combined, 'serif-bold', 2.7, maxSubW, 1.5);
    const prefix = `${info.subtitle}${sep}`;
    if (fittedSub === combined) {
      P.writeBilingual(info.subtitle, secondarySub, x + 5.8, y + 16.4, {
        face: 'serif-bold',
        size: subSize,
        align: 'left',
        color: PALETTE.crimson,
        slant: 0.22,
        layout: 'inline',
        sep,
      });
    } else if (fittedSub.startsWith(prefix)) {
      P.writeBilingual(info.subtitle, fittedSub.slice(prefix.length), x + 5.8, y + 16.4, {
        face: 'serif-bold',
        size: subSize,
        align: 'left',
        color: PALETTE.crimson,
        slant: 0.22,
        layout: 'inline',
        sep,
      });
    } else {
      P.italic(fittedSub, x + 5.8, y + 16.4, { face: 'serif-bold', size: subSize, align: 'left', color: PALETTE.crimson });
    }
  } else if (info.subtitle || secondarySub) {
    const subText = info.subtitle || secondarySub;
    const { text: fittedSub, size: subSize } = fitTextToWidth(subText, 'serif-bold', 2.7, maxSubW, 1.5);
    P.italic(fittedSub, x + 5.8, y + 16.4, { face: 'serif-bold', size: subSize, align: 'left', color: PALETTE.crimson });
  }

  // Divider line
  P.ink([[x + 5, y + 18.6], [x + w - 5, y + 18.6]], { nib: 0.12, color: '#9c8e7b' });

  // Fact rows (left column) & Map Legend (right column)
  const langKey = String(info.lang || 'en').toLowerCase().slice(0, 2);
  const loc = CARTOUCHE_LOCALE[langKey] || CARTOUCHE_LOCALE.en;
  const fl = { ...loc.facts, ...(info.factLabels || {}) };
  const rawFacts = info.facts || [
    [fl.capital, info.capital],
    [fl.language, info.language],
    [fl.population, info.population],
    [fl.area, info.area],
  ].filter(([, v]) => v);
  const facts = rawFacts.map((entry) => (Array.isArray(entry) ? `${entry[0]}${fl.sep}${entry[1]}` : entry));
  facts.forEach((txt, i) => {
    P.text(txt, x + 5.5, y + 23.0 + i * 4.2, { face: 'sans-bold', size: 2.25, align: 'left', color: PALETTE.ink });
  });

  // Legend on right side of cartouche: [{ symbol: 'capital' | 'city' | 'route' | 'river', label, color }]
  const lx = x + w * 0.58;
  const legend = info.legend || [
    { symbol: 'capital', label: loc.legend.capital },
    { symbol: 'city', label: loc.legend.city },
    { symbol: 'route', label: loc.legend.route },
  ];
  legend.forEach((item, i) => {
    const ly = y + 22.2 + i * 4.5;
    if (item.symbol === 'capital') {
      P.dot(lx, ly, 1.1, item.color || PALETTE.crimson);
      P.outline([D.ell(lx, ly, 1.7, 1.7)], { nib: 0.13, color: item.color || PALETTE.crimson });
    } else if (item.symbol === 'city') {
      P.dot(lx, ly + 0.1, 0.8, item.color || PALETTE.ink);
    } else if (item.symbol === 'river') {
      P.ink([[lx - 2.0, ly], [lx + 2.2, ly]], { nib: 0.36, color: item.color || PALETTE.river });
    } else {
      P.ink([[lx - 2.0, ly], [lx - 0.3, ly]], { nib: 0.2, color: item.color || PALETTE.navy });
      P.ink([[lx + 0.7, ly], [lx + 2.2, ly]], { nib: 0.2, color: item.color || PALETTE.navy });
    }
    P.text(item.label, lx + 3.2, ly + 0.7, { face: 'sans', size: 2.15, align: 'left' });
  });

  // Graphical Scale Bar across bottom of cartouche: three segments of a round number of km
  const sy = y + h - 5.2, sx0 = x + 6;
  const mmPerKm = info.mmPerKm ?? (info.mmPer100km ?? 14.0) / 100;
  const unit = info.scaleKm ?? (info.mmPerKm
    ? [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find((u) => u * mmPerKm >= 9) ?? 5000
    : 100);
  const seg = unit * mmPerKm;
  for (let k = 0; k < 3; k++) {
    const bx = sx0 + k * seg;
    part(P, [[bx, sy], [bx + seg, sy], [bx + seg, sy + 1.4], [bx, sy + 1.4]], k % 2 === 0 ? PALETTE.ink : PALETTE.paper, { nib: 0.12 });
    P.text(String(k * unit), bx, sy - 0.8, { face: 'sans', size: 1.85, align: 'center' });
  }
  P.text(`${3 * unit} km`, sx0 + 3 * seg, sy - 0.8, { face: 'sans-bold', size: 1.85, align: 'center' });
}

// Framed Inset Map Box (e.g., Ryukyu / Okinawa Islands)
function drawInsetBox(P, x, y, w, h, title) {
  const box = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  wash(P, [box], PALETTE.ocean, { reset: true, strength: 0.82, toothAmt: 0.38 });
  P.ink([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], { nib: 0.3, color: PALETTE.ink });
  P.ink([[x + 1.1, y + 1.1], [x + w - 1.1, y + 1.1], [x + w - 1.1, y + h - 1.1], [x + 1.1, y + h - 1.1], [x + 1.1, y + 1.1]], { nib: 0.12, color: PALETTE.ink });
  if (title) {
    const baseSize = 2.3;
    const maxTw = Math.max(4, w - 5);
    const measured = Lt.measure(title, 'serif-bold', baseSize);
    const padX = 5.5;
    const tw = Math.min(maxTw, Math.max(Math.min(8, maxTw), measured + padX));
    const maxTextW = Math.max(2, tw - 3.5);
    const { text: fittedTitle, size: fitSize } = fitTextToWidth(title, 'serif-bold', baseSize, maxTextW, 1.2);
    part(P, D.rrect(x + 2.5, y + 2.2, x + 2.5 + tw, y + 7.2, 0.8), PALETTE.cream, { nib: 0.16 });
    P.text(fittedTitle, x + 2.5 + tw / 2, y + 5.5, { face: 'serif-bold', size: fitSize, align: 'center' });
  }
  return box;
}

module.exports = {
  PALETTE,
  at,
  part,
  wash,
  createProjection,
  fitProjection,
  geoRings,
  clipRing,
  simplifyRing,
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
