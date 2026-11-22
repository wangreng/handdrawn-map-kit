'use strict';
const D = require('../engine/lib/draw');
const MK = require('../engine/lib/mask');
const Lt = require('../engine/lib/letter');
const { drawFlag } = require('./flags');
const { BASE_PALETTE } = require('./styles');

// Authentic hand-colored vintage atlas palette
const PALETTE = { ...BASE_PALETTE };

const palOf = (P) => (P && P.palette) || PALETTE;
const styleOf = (P) => (P && P.style) || null;

const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const at = (x, y, s = 1, a = 0) => (pts) => pts.map((p) => {
  const q = rot([p[0] * s, p[1] * s], a);
  return [x + q[0], y + q[1]];
});

function part(P, poly, color, o = {}) {
  const st = styleOf(P);
  const pal = palOf(P);
  const fillMode = o.fillMode || st?.fill?.mode || 'pencil';
  const polys = Array.isArray(poly[0]) && Array.isArray(poly[0][0]) ? poly : [poly];
  const outlineColor = o.outlineColor || pal.ink;

  if (fillMode === 'ink-wash') {
    P.paper(polys, { clip: o.clip, cut: o.cut });
    if (color) {
      washBloom(P, polys, color, {
        strength: o.strength ?? st?.fill?.strength ?? 0.76,
        toothAmt: o.toothAmt ?? st?.fill?.toothAmt ?? 0.38,
        edgeAmt: o.edgeAmt ?? st?.fill?.edgeAmt ?? 0.32,
        cloudAmt: o.cloudAmt ?? st?.fill?.cloudAmt ?? 0.24,
        clip: o.clip,
        cut: o.cut,
      });
    }
    if (o.shade) {
      washBloom(P, polys, pal.mountain, {
        clip: [o.shade],
        strength: 0.36,
        edgeAmt: 0.22,
        cloudAmt: 0.18,
      });
    }
    if (o.outline !== false) {
      P.outline(polys, { nib: o.nib ?? 0.24, clip: o.clip, cut: o.cut, color: outlineColor });
    }
    return;
  }

  if (fillMode === 'blueprint' || fillMode === 'nocturne') {
    P.paper(polys, { clip: o.clip, cut: o.cut });
    if (color) {
      wash(P, polys, color, {
        strength: o.strength ?? st?.fill?.washStrength ?? 0.64,
        toothAmt: o.toothAmt ?? st?.fill?.toothAmt ?? 0.26,
        clip: o.clip,
        cut: o.cut,
      });
      if (o.hatchFill !== false && st?.fill?.hatchPitch) {
        const m = MK.maskOf(P.S, polys);
        const bb = MK.bboxOf(P.S, m);
        const spanMm = bb ? Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / P.S.ppm : 0;
        if (spanMm > 14) {
          P.hatch(polys, {
            mask: m,
            angle: st.fill.hatchAngle ?? 42,
            pitch: st.fill.hatchPitch ?? 1.6,
            nib: 0.10,
            color: st.fill.hatchColor || pal.graticule,
            pressure: 0.45,
          });
        }
      }
    }
    if (o.shade) {
      P.hatch(polys, { clip: [o.shade], angle: o.hatch ?? 70, pitch: o.pitch ?? 0.85, nib: 0.09, color: pal.ink });
    }
    if (o.outline !== false) {
      P.outline(polys, { nib: o.nib ?? 0.22, clip: o.clip, cut: o.cut, color: outlineColor });
    }
    return;
  }

  // Default vintage-atlas pencil + fineliner pipeline (exact backward compatibility)
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
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error('Invalid bbox: expected [west, south, east, north] of 4 finite numbers');
  }
  const [w, s, e, n] = bbox;
  if (
    typeof w !== 'number' || !Number.isFinite(w)
    || typeof s !== 'number' || !Number.isFinite(s)
    || typeof e !== 'number' || !Number.isFinite(e)
    || typeof n !== 'number' || !Number.isFinite(n)
    || s > n
  ) {
    throw new Error('Invalid bbox: expected [west, south, east, north] of 4 finite numbers with south <= north');
  }
  const eNorm = w > e ? e + 360 : e;
  if (eNorm === w || n === s) {
    throw new Error('Invalid bbox: zero-span bounding box cannot be fitted');
  }
  const [x0, y0, x1, y1] = o.frame;
  const rotDeg = o.rotDeg ?? 0;
  const rawLon0 = (w + eNorm) / 2;
  const lon0 = rawLon0 > 180 ? rawLon0 - 360 : rawLon0;
  const lat0 = (s + n) / 2;
  const unit = createProjection({ lon0, lat0, cx: 0, cy: 0, scale: 1, rotDeg });
  let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    for (const [lon, lat] of [[w + (eNorm - w) * t, s], [w + (eNorm - w) * t, n], [w, s + (n - s) * t], [eNorm, s + (n - s) * t]]) {
      const [x, y] = unit(lon, lat);
      if (x < ax) ax = x;
      if (x > bx) bx = x;
      if (y < ay) ay = y;
      if (y > by) by = y;
    }
  }
  const dx = bx - ax;
  const dy = by - ay;
  if (!(dx > 0) || !(dy > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    throw new Error('Invalid bbox: projected bounding box has zero or non-finite span');
  }
  const scale = (o.zoom ?? 1) * Math.min((x1 - x0) / dx, (y1 - y0) / dy);
  return createProjection({
    lon0,
    lat0,
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
  if (o.cut) MK.subtract(P.S, m, o.cut);
  if (o.clip) {
    const c = MK.maskOf(P.S, o.clip);
    for (let i = 0; i < m.length; i++) m[i] &= c[i];
  }
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

// Wet watercolor / mineral ink-wash fill with organic pigment clouds and subtle wet edge granulation (水痕积墨边)
function washBloom(P, polys, hexColor, o = {}) {
  const { hexToRgb, rng } = require('../engine/kit/util');
  const col = hexToRgb(hexColor);
  const strength = o.strength ?? 0.74;
  const toothAmt = o.toothAmt ?? 0.38;
  const edgeAmt = o.edgeAmt ?? 0.30;
  const cloudAmt = o.cloudAmt ?? 0.22;
  const m = o.mask || MK.maskOf(P.S, polys);
  if (o.cut) MK.subtract(P.S, m, o.cut);
  if (o.clip) {
    const c = MK.maskOf(P.S, o.clip);
    for (let i = 0; i < m.length; i++) m[i] &= c[i];
  }
  const bb = MK.bboxOf(P.S, m);
  if (!bb) return m;

  const { W, H, ppm, rgb, tooth, paper0 } = P.S;
  const bw = bb.x1 - bb.x0 + 1;
  const bh = bb.y1 - bb.y0 + 1;

  // Build coarse smooth pigment cloud field over bbox
  const cell = Math.max(6, Math.round(14 * ppm));
  const gw = Math.ceil(bw / cell) + 3;
  const gh = Math.ceil(bh / cell) + 3;
  const R = rng(`${P.S.seed}:bloom:${hexColor}:${bb.x0}:${bb.y0}`);
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = R() * 2 - 1;
  const invCell = 1 / cell;

  // Approximate inner wet rim: check 4-direction neighborhood at ~1.4mm radius
  const edgeR = Math.max(2, Math.round(1.3 * ppm));
  // Darker mineral rim color (pigment pools at drying edge)
  const rimCol = [
    Math.max(0, col[0] * 0.80),
    Math.max(0, col[1] * 0.82),
    Math.max(0, col[2] * 0.82),
  ];

  for (let y = bb.y0; y <= bb.y1; y++) {
    const row = y * W;
    const fy = (y - bb.y0) * invCell;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = row + x;
      if (!m[i]) continue;
      const j = 3 * i;
      if (o.reset) {
        rgb[j] = paper0[j]; rgb[j + 1] = paper0[j + 1]; rgb[j + 2] = paper0[j + 2];
      }
      const fx = (x - bb.x0) * invCell;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const a0 = grid[y0 * gw + x0];
      const b0 = grid[y0 * gw + x0 + 1];
      const c0 = grid[(y0 + 1) * gw + x0];
      const d0 = grid[(y0 + 1) * gw + x0 + 1];
      const cloud = (a0 + (b0 - a0) * sx) + ((c0 + (d0 - c0) * sx) - (a0 + (b0 - a0) * sx)) * sy;

      let nearEdge = 0;
      if (edgeAmt > 0) {
        const xm = x - edgeR, xp = x + edgeR, ym = y - edgeR, yp = y + edgeR;
        if (xm < 0 || xp >= W || ym < 0 || yp >= H
          || !m[row + xm] || !m[row + xp] || !m[ym * W + x] || !m[yp * W + x]) {
          nearEdge = 1;
        }
      }

      const t = tooth[i];
      const toothMod = 1 - toothAmt * (t - 0.5);
      const cloudMod = 1 + cloudAmt * cloud;
      const alpha = Math.max(0, Math.min(0.96, strength * toothMod * cloudMod * (1 + nearEdge * edgeAmt * 0.45)));
      const edgeMix = nearEdge * edgeAmt * 0.55;
      const tr = col[0] + (rimCol[0] - col[0]) * edgeMix;
      const tg = col[1] + (rimCol[1] - col[1]) * edgeMix;
      const tb = col[2] + (rimCol[2] - col[2]) * edgeMix;

      rgb[j] += (tr - rgb[j]) * alpha;
      rgb[j + 1] += (tg - rgb[j + 1]) * alpha;
      rgb[j + 2] += (tb - rgb[j + 2]) * alpha;
    }
  }
  return m;
}

// Fill ocean background inside frame in ~5ms while preserving full paper fibre texture!
function drawOcean(P, { pad = 5, color } = {}) {
  const st = styleOf(P);
  const pal = palOf(P);
  const oceanColor = color || pal.ocean;
  const mode = st?.ocean?.mode || 'wash';
  const rect = [[pad, pad], [P.w - pad, pad], [P.w - pad, P.h - pad], [pad, P.h - pad]];

  if (mode === 'ink-wash') {
    washBloom(P, [rect], oceanColor, {
      strength: st.ocean.strength ?? 0.72,
      toothAmt: st.ocean.toothAmt ?? 0.40,
      edgeAmt: 0.14,
      cloudAmt: st.ocean.cloudAmt ?? 0.24,
    });
    // Subtle aged xuan-paper warm vignette around the border
    const vig = st.ocean.vignette ?? 0.16;
    if (vig > 0) {
      const { W, H, rgb } = P.S;
      const cx = W / 2, cy = H / 2;
      for (let y = 0; y < H; y++) {
        const dy = (y - cy) / cy;
        const row = y * W;
        for (let x = 0; x < W; x++) {
          const dx = (x - cx) / cx;
          const r2 = Math.min(1, (dx * dx + dy * dy) * 0.55);
          const d = r2 * r2 * vig;
          if (d <= 0.002) continue;
          const j = 3 * (row + x);
          rgb[j] *= 1 - d * 0.65;
          rgb[j + 1] *= 1 - d * 0.72;
          rgb[j + 2] *= 1 - d * 0.85;
        }
      }
    }
    return;
  }

  if (mode === 'blueprint') {
    wash(P, [rect], oceanColor, { strength: st.ocean.strength ?? 0.56, toothAmt: st.ocean.toothAmt ?? 0.25 });
    // Crisp cyanotype architectural grid (10mm minor, 50mm major)
    const { W, ppm, rgb, tooth } = P.S;
    const step = st.ocean.gridStep ?? 10;
    const x0 = Math.round(pad * ppm), x1 = Math.round((P.w - pad) * ppm);
    const y0 = Math.round(pad * ppm), y1 = Math.round((P.h - pad) * ppm);
    const gridRgb = [132, 186, 240];
    const drawLine = (pos, horiz, alpha) => {
      if (horiz) {
        if (pos < y0 || pos >= y1) return;
        for (let x = x0; x < x1; x++) {
          const i = pos * W + x;
          const a = alpha * (0.65 + 0.7 * tooth[i]);
          const j = 3 * i;
          rgb[j] += (gridRgb[0] - rgb[j]) * a;
          rgb[j + 1] += (gridRgb[1] - rgb[j + 1]) * a;
          rgb[j + 2] += (gridRgb[2] - rgb[j + 2]) * a;
        }
      } else {
        if (pos < x0 || pos >= x1) return;
        for (let y = y0; y < y1; y++) {
          const i = y * W + pos;
          const a = alpha * (0.65 + 0.7 * tooth[i]);
          const j = 3 * i;
          rgb[j] += (gridRgb[0] - rgb[j]) * a;
          rgb[j + 1] += (gridRgb[1] - rgb[j + 1]) * a;
          rgb[j + 2] += (gridRgb[2] - rgb[j + 2]) * a;
        }
      }
    };
    for (let mm = step, k = 1; mm < P.w - pad; mm += step, k++) {
      drawLine(Math.round(mm * ppm), false, k % 5 === 0 ? 0.22 : 0.09);
    }
    for (let mm = step, k = 1; mm < P.h - pad; mm += step, k++) {
      drawLine(Math.round(mm * ppm), true, k % 5 === 0 ? 0.22 : 0.09);
    }
    return;
  }

  if (mode === 'nocturne') {
    const { rng } = require('../engine/kit/util');
    wash(P, [rect], oceanColor, { strength: st.ocean.strength ?? 0.74, toothAmt: st.ocean.toothAmt ?? 0.26 });
    const { W, H, ppm, rgb } = P.S;
    // Deep radial celestial glow (slightly luminous indigo center, deep obsidian edges)
    const cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) {
      const dy = (y - cy) / cy;
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / cx;
        const glow = Math.max(0, 1 - (dx * dx + dy * dy) * 0.72);
        const j = 3 * (row + x);
        rgb[j] += glow * 10;
        rgb[j + 1] += glow * 15;
        rgb[j + 2] += glow * 28;
      }
    }
    // Delicate starfield scattered across the night sea
    if (st.ocean.stars !== false) {
      const Rs = rng(`${P.S.seed}:nocturne:stars`);
      const count = Math.round((P.w * P.h) / 260);
      for (let k = 0; k < count; k++) {
        const sx = (pad + 3 + Rs() * (P.w - 2 * pad - 6)) * ppm;
        const sy = (pad + 3 + Rs() * (P.h - 2 * pad - 6)) * ppm;
        const bright = Rs();
        const starR = bright > 0.9 ? 1.55 : bright > 0.65 ? 1.05 : 0.7;
        const starCol = bright > 0.75 ? [248, 224, 158] : [215, 228, 250];
        const alpha = 0.28 + bright * 0.58;
        const x0 = Math.max(0, Math.floor(sx - starR - 1));
        const x1 = Math.min(W - 1, Math.ceil(sx + starR + 1));
        const y0 = Math.max(0, Math.floor(sy - starR - 1));
        const y1 = Math.min(H - 1, Math.ceil(sy + starR + 1));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
            const cov = Math.max(0, 1 - d / (starR + 0.4));
            if (cov <= 0) continue;
            const a = cov * cov * alpha;
            const j = 3 * (y * W + x);
            rgb[j] += (starCol[0] - rgb[j]) * a;
            rgb[j + 1] += (starCol[1] - rgb[j + 1]) * a;
            rgb[j + 2] += (starCol[2] - rgb[j + 2]) * a;
          }
        }
        // Subtle 4-point star cross on brightest stars
        if (bright > 0.92) {
          const arm = Math.round(starR * 2.8);
          for (let d = -arm; d <= arm; d++) {
            const a = (1 - Math.abs(d) / (arm + 1)) * 0.45;
            const px = Math.round(sx) + d, py = Math.round(sy);
            if (px >= 0 && px < W && py >= 0 && py < H) {
              const j = 3 * (py * W + px);
              rgb[j] += (starCol[0] - rgb[j]) * a;
              rgb[j + 1] += (starCol[1] - rgb[j + 1]) * a;
              rgb[j + 2] += (starCol[2] - rgb[j + 2]) * a;
            }
            const qx = Math.round(sx), qy = Math.round(sy) + d;
            if (qx >= 0 && qx < W && qy >= 0 && qy < H) {
              const j = 3 * (qy * W + qx);
              rgb[j] += (starCol[0] - rgb[j]) * a;
              rgb[j + 1] += (starCol[1] - rgb[j + 1]) * a;
              rgb[j + 2] += (starCol[2] - rgb[j + 2]) * a;
            }
          }
        }
      }
    }
    return;
  }

  wash(P, [rect], oceanColor, { strength: 0.82, toothAmt: 0.38 });
}

// Clip an open polyline to [x0, y0, x1, y1] using Liang-Barsky; runs start and end on the box edge.
function clipRuns(pts, x0, y0, x1, y1) {
  const runs = [];
  let cur = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;
    const checks = [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]];
    let ok = true;
    for (const [p, q] of checks) {
      if (p === 0) {
        if (q < 0) { ok = false; break; }
      } else {
        const r = q / p;
        if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
      }
    }
    if (!ok || t0 >= t1) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
      continue;
    }
    const p0 = t0 === 0 ? a : [a[0] + dx * t0, a[1] + dy * t0];
    const p1 = t1 === 1 ? b : [a[0] + dx * t1, a[1] + dy * t1];
    if (t0 === 0 && cur.length) {
      cur.push(p1);
    } else {
      if (cur.length > 1) runs.push(cur);
      cur = [p0, p1];
    }
    if (t1 < 1) {
      if (cur.length > 1) runs.push(cur);
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

// Drop vertices closer than `tol` mm to the line between their kept neighbours (open-polyline Douglas–Peucker)
function simplifyLine(pts, tol) {
  const n = pts.length;
  if (n < 3 || !(tol > 0)) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const a = pts[i0], b = pts[i1];
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
    let worst = -1, worstD = tol2;
    for (let i = i0 + 1; i < i1; i++) {
      const p = pts[i];
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
      const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([i0, worst], [worst, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Unwrap consecutive >180° longitude jumps along an open polyline so antimeridian crossings stay continuous.
function unwrapLine(line) {
  const out = [];
  let prev = null;
  for (let i = 0; i < line.length; i++) {
    const pt = line[i];
    if (!Array.isArray(pt) || pt.length < 2) continue;
    let lon = pt[0];
    const lat = pt[1];
    if (typeof lon !== 'number' || !Number.isFinite(lon) || typeof lat !== 'number' || !Number.isFinite(lat)) {
      continue;
    }
    if (prev !== null) {
      const d = lon - prev;
      if (d > 180 || d < -180) {
        lon -= Math.round(d / 360) * 360;
      }
    }
    out.push([lon, lat]);
    prev = lon;
  }
  return out;
}

// Project (lon, lat) open polylines to hand-drawable mm polylines.
// Clipped to sheet frame via clipRuns, simplified, smoothed, and stubs shorter than `minLen` mm dropped.
function geoLines(P, proj, lines, o) {
  const opts = o || {};
  const m = opts.margin ?? 12;
  const [x0, y0, x1, y1] = opts.frame || [-m, -m, P.w + m, P.h + m];
  const minLen = opts.minLen ?? 1.5;
  const out = [];
  for (const line of lines || []) {
    if (!line || line.length < 2) continue;
    const unwrapped = unwrapLine(line);
    if (unwrapped.length < 2) continue;
    let projected;
    if (proj.ring) {
      projected = proj.ring(unwrapped);
    } else {
      const lon0 = Number.isFinite(proj.lon0) ? proj.lon0 : proj.params?.lon0;
      if (Number.isFinite(lon0)) {
        let lo = Infinity, hi = -Infinity;
        for (const [lon] of unwrapped) {
          if (lon < lo) lo = lon;
          if (lon > hi) hi = lon;
        }
        const shift = Math.round((lon0 - (lo + hi) / 2) / 360) * 360;
        projected = proj.pts(shift ? unwrapped.map(([lon, lat]) => [lon + shift, lat]) : unwrapped);
      } else {
        projected = proj.pts(unwrapped);
      }
    }
    for (let run of clipRuns(projected, x0, y0, x1, y1)) {
      if (run.length < 2 || D.polyLen(run) < minLen) continue;
      run = simplifyLine(run, opts.simplify ?? 0.12);
      out.push(opts.smooth === false || run.length < 3 ? run : D.curve(run, false, opts.step ?? 0.35));
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

  const pal = palOf(P);
  const gratColor = o.color || pal.graticule;
  for (const lon of lons) {
    const raw = [];
    for (let i = 0; i <= N; i++) raw.push(proj(lon, Math.max(-89, Math.min(89, south + ((north - south) * i) / N))));
    for (const run of clipRuns(raw, x0, y0, x1, y1)) {
      P.ink(run, { nib: 0.1, color: gratColor, tremor: 0.25 });
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
      P.ink(run, { nib: 0.1, color: gratColor, tremor: 0.25 });
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
  const st = styleOf(P);
  const pal = palOf(P);
  const mode = o.mode || st?.waterlines?.mode || 'concentric';
  const m = MK.maskOf(P.S, polys);
  const r1 = MK.dilate(P.S, m, o.r1 ?? st?.waterlines?.r1 ?? 1.4);
  const r2 = MK.dilate(P.S, m, o.r2 ?? st?.waterlines?.r2 ?? 2.8);
  const collar = new Uint8Array(r1.length);
  for (let i = 0; i < r1.length; i++) collar[i] = r1[i] && !m[i] ? 1 : 0;

  if (mode === 'ink-ripple') {
    washBloom(P, [], o.shallowColor || pal.oceanShallow, { mask: collar, strength: 0.58, toothAmt: 0.42, edgeAmt: 0.25, cloudAmt: 0.25 });
    MK.outline(P.S, P.pen(0.14, pal.waterline), r1, { tremor: 0.65 });
    MK.outline(P.S, P.pen(0.10, pal.waterlineOuter), r2, { dash: 5.5, gap: 2.6, tremor: 0.7 });
    return;
  }

  if (mode === 'glow') {
    const outerCollar = new Uint8Array(r2.length);
    for (let i = 0; i < r2.length; i++) outerCollar[i] = r2[i] && !r1[i] ? 1 : 0;
    wash(P, [], o.shallowColor || pal.oceanShallow, { mask: collar, strength: 0.52, toothAmt: 0.22 });
    wash(P, [], o.shallowColor || pal.oceanShallow, { mask: outerCollar, strength: 0.24, toothAmt: 0.22 });
    MK.outline(P.S, P.pen(0.13, pal.waterline), r1, { tremor: 0.35 });
    MK.outline(P.S, P.pen(0.09, pal.waterlineOuter), r2, { dash: 3.6, gap: 2.0, tremor: 0.3 });
    return;
  }

  wash(P, [], o.shallowColor || pal.oceanShallow, { mask: collar, strength: 0.65, toothAmt: 0.35 });
  MK.outline(P.S, P.pen(0.12, pal.waterline || '#6994a8'), r1, { tremor: 0.45 });
  MK.outline(P.S, P.pen(0.09, pal.waterlineOuter || '#88aebf'), r2, { dash: 4.2, gap: 1.8 });
}

// Hand-drawn crinkled landmass (lower tension preserves real bays & peninsulas!)
function drawLand(P, ctrlPts, o = {}) {
  const pal = palOf(P);
  const poly = D.curve(ctrlPts, true, o.tension ?? 0.22);
  part(P, poly, o.color || pal.land, {
    pressure: o.pressure ?? 0.62,
    passes: o.passes ?? 2,
    blunt: true,
    nib: o.nib ?? 0.30,
    outlineColor: o.outlineColor || pal.ink,
    clip: o.clip,
  });
  return poly;
}

function drawTickLabels(P, ticks, inner, color) {
  const { w, h } = P;
  for (const t of ticks || []) {
    if (t.x < inner + 10 || t.x > w - inner - 10) {
      if (t.side === 'top' || t.side === 'bottom') continue;
    }
    if (t.y < inner + 8 || t.y > h - inner - 8) {
      if (t.side === 'left' || t.side === 'right') continue;
    }
    const align = t.side === 'left' ? 'left' : t.side === 'right' ? 'right' : 'center';
    P.text(t.text, t.x, t.y, { face: 'sans-bold', size: 1.85, align, color });
  }
}

function drawBlueprintBorder(P, o, pal, pad, inner) {
  const { w, h } = P;
  // Clean deep navy paper margin
  P.paper([
    [[0, 0], [w, 0], [w, inner], [0, inner]],
    [[0, h - inner], [w, h - inner], [w, h], [0, h]],
    [[0, 0], [inner, 0], [inner, h], [0, h]],
    [[w - inner, 0], [w, 0], [w, h], [w - inner, h]],
  ]);
  const band = inner - pad;
  // Outer heavy + inner fine technical neatlines
  P.ink([[pad, pad], [w - pad, pad], [w - pad, h - pad], [pad, h - pad], [pad, pad]], { nib: 0.34, color: pal.ink });
  P.ink([[inner, inner], [w - inner, inner], [w - inner, h - inner], [inner, h - inner], [inner, inner]], { nib: 0.18, color: pal.borderAccent });
  // Technical ruler ticks along all 4 sides
  const step = o.step ?? 10;
  for (let x = inner + step; x < w - inner - 1; x += step) {
    const major = Math.round(x) % 50 === 0;
    const len = major ? band : band * 0.55;
    P.ink([[x, inner - len], [x, inner]], { nib: major ? 0.16 : 0.10, color: pal.borderAccent });
    P.ink([[x, h - inner], [x, h - inner + len]], { nib: major ? 0.16 : 0.10, color: pal.borderAccent });
  }
  for (let y = inner + step; y < h - inner - 1; y += step) {
    const major = Math.round(y) % 50 === 0;
    const len = major ? band : band * 0.55;
    P.ink([[inner - len, y], [inner, y]], { nib: major ? 0.16 : 0.10, color: pal.borderAccent });
    P.ink([[w - inner, y], [w - inner + len, y]], { nib: major ? 0.16 : 0.10, color: pal.borderAccent });
  }
  // Corner registration crosshairs
  const cr = band * 0.42;
  for (const [cx, cy] of [[pad + band / 2, pad + band / 2], [w - pad - band / 2, pad + band / 2], [pad + band / 2, h - pad - band / 2], [w - pad - band / 2, h - pad - band / 2]]) {
    P.outline([D.ell(cx, cy, cr, cr)], { nib: 0.13, color: pal.ink });
    P.ink([[cx - cr * 1.3, cy], [cx + cr * 1.3, cy]], { nib: 0.11, color: pal.borderAccent });
    P.ink([[cx, cy - cr * 1.3], [cx, cy + cr * 1.3]], { nib: 0.11, color: pal.borderAccent });
  }
  drawTickLabels(P, o.ticks, inner, pal.tickLabel);
}

function drawCelestialBorder(P, o, pal, pad, inner) {
  const { w, h } = P;
  P.paper([
    [[0, 0], [w, 0], [w, inner], [0, inner]],
    [[0, h - inner], [w, h - inner], [w, h], [0, h]],
    [[0, 0], [inner, 0], [inner, h], [0, h]],
    [[w - inner, 0], [w, 0], [w, h], [w - inner, h]],
  ]);
  const band = inner - pad;
  const mid = pad + band * 0.5;
  P.ink([[pad, pad], [w - pad, pad], [w - pad, h - pad], [pad, h - pad], [pad, pad]], { nib: 0.30, color: pal.borderAccent });
  P.ink([[mid, mid], [w - mid, mid], [w - mid, h - mid], [mid, h - mid], [mid, mid]], { nib: 0.10, color: pal.graticule });
  P.ink([[inner, inner], [w - inner, inner], [w - inner, h - inner], [inner, h - inner], [inner, inner]], { nib: 0.22, color: pal.ink });
  // Degree ticks along the gold frame
  const step = o.step ?? 15;
  for (let x = inner + step; x < w - inner - 1; x += step) {
    P.ink([[x, pad], [x, inner]], { nib: 0.11, color: pal.borderAccent });
    P.ink([[x, h - inner], [x, h - pad]], { nib: 0.11, color: pal.borderAccent });
  }
  for (let y = inner + step; y < h - inner - 1; y += step) {
    P.ink([[pad, y], [inner, y]], { nib: 0.11, color: pal.borderAccent });
    P.ink([[w - inner, y], [w - pad, y]], { nib: 0.11, color: pal.borderAccent });
  }
  // 4-point celestial star medallions in the corners
  const r = band * 0.48;
  for (const [cx, cy] of [[pad + band / 2, pad + band / 2], [w - pad - band / 2, pad + band / 2], [pad + band / 2, h - pad - band / 2], [w - pad - band / 2, h - pad - band / 2]]) {
    const star = [
      [cx, cy - r], [cx + r * 0.28, cy - r * 0.28], [cx + r, cy], [cx + r * 0.28, cy + r * 0.28],
      [cx, cy + r], [cx - r * 0.28, cy + r * 0.28], [cx - r, cy], [cx - r * 0.28, cy - r * 0.28],
    ];
    wash(P, [star], pal.borderAccent, { strength: 0.85, toothAmt: 0.18 });
    P.outline([star], { nib: 0.12, color: pal.ink });
  }
  drawTickLabels(P, o.ticks, inner, pal.tickLabel);
}

function drawScrollBorder(P, o, pal, pad, inner) {
  const { w, h } = P;
  // Clean warm xuan-paper margin
  P.paper([
    [[0, 0], [w, 0], [w, inner], [0, inner]],
    [[0, h - inner], [w, h - inner], [w, h], [0, h]],
    [[0, 0], [inner, 0], [inner, h], [0, h]],
    [[w - inner, 0], [w, 0], [w, h], [w - inner, h]],
  ]);
  const band = inner - pad;
  // Subtle cream mounting silk tint inside the border band
  wash(P, [
    [[pad, pad], [w - pad, pad], [w - pad, inner], [pad, inner]],
    [[pad, h - inner], [w - pad, h - inner], [w - pad, h - pad], [pad, h - pad]],
    [[pad, inner], [inner, inner], [inner, h - inner], [pad, h - inner]],
    [[w - inner, inner], [w - pad, inner], [w - pad, h - inner], [w - inner, h - inner]],
  ], pal.cream, { strength: 0.72, toothAmt: 0.35 });
  // Traditional Chinese bold outer brush frame + fine inner hairline (子母双线框)
  P.ink([[pad, pad], [w - pad, pad], [w - pad, h - pad], [pad, h - pad], [pad, pad]], { nib: 0.50, color: pal.ink });
  P.ink([[pad + band * 0.36, pad + band * 0.36], [w - pad - band * 0.36, pad + band * 0.36], [w - pad - band * 0.36, h - pad - band * 0.36], [pad + band * 0.36, h - pad - band * 0.36], [pad + band * 0.36, pad + band * 0.36]], { nib: 0.12, color: pal.ink });
  P.ink([[inner, inner], [w - inner, inner], [w - inner, h - inner], [inner, h - inner], [inner, inner]], { nib: 0.22, color: pal.ink });
  // Corner Chinese fretwork (回纹角饰) with subtle vermilion dots
  const cSz = band + 3.2;
  const drawCornerFret = (cx, cy, sx, sy) => {
    P.ink([
      [cx, cy + sy * cSz], [cx + sx * cSz, cy + sy * cSz], [cx + sx * cSz, cy],
    ], { nib: 0.16, color: pal.ink });
    P.dot(cx + sx * (band * 0.5), cy + sy * (band * 0.5), 0.55, pal.crimson);
  };
  drawCornerFret(pad, pad, 1, 1);
  drawCornerFret(w - pad, pad, -1, 1);
  drawCornerFret(pad, h - pad, 1, -1);
  drawCornerFret(w - pad, h - pad, -1, -1);
  drawTickLabels(P, o.ticks, inner, pal.tickLabel);
}

// Classic Cartographic Zebra Neatline Border + Graticule Labels + Corner Rosettes (dispatches by style.border)
function drawZebraBorder(P, o = {}) {
  const { w, h } = P;
  const pad = o.pad ?? 4.8;
  const inner = o.inner ?? 8.0;
  const st = styleOf(P);
  const pal = palOf(P);
  const borderStyle = o.style || st?.border || 'zebra';

  if (borderStyle === 'blueprint') return drawBlueprintBorder(P, o, pal, pad, inner);
  if (borderStyle === 'celestial') return drawCelestialBorder(P, o, pal, pad, inner);
  if (borderStyle === 'scroll') return drawScrollBorder(P, o, pal, pad, inner);

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
  wash(P, creamBars, pal.cream, { strength: 0.85 });
  wash(P, darkBars, pal.ink, { strength: 0.88, toothAmt: 0.45 });
  for (const [a, b] of ticks) P.ink([a, b], { nib: 0.14, color: pal.ink });
  P.ink([[pad, pad + band * 0.58], [w - pad, pad + band * 0.58]], { nib: 0.14, color: pal.ink });
  P.ink([[pad, h - pad - band * 0.58], [w - pad, h - pad - band * 0.58]], { nib: 0.14, color: pal.ink });
  P.ink([[pad + band * 0.58, pad], [pad + band * 0.58, h - pad]], { nib: 0.14, color: pal.ink });
  P.ink([[w - pad - band * 0.58, pad], [w - pad - band * 0.58, h - pad]], { nib: 0.14, color: pal.ink });

  // Outer & inner crisp neatlines
  P.ink([[pad, pad], [w - pad, pad], [w - pad, h - pad], [pad, h - pad], [pad, pad]], { nib: 0.36, color: pal.ink });
  P.ink([[inner, inner], [w - inner, inner], [w - inner, h - inner], [inner, h - inner], [inner, inner]], { nib: 0.24, color: pal.ink });

  // Corner ochre blocks
  for (const [x0, y0] of [[pad, pad], [w - inner, pad], [pad, h - inner], [w - inner, h - inner]]) {
    part(P, [[x0, y0], [x0 + band, y0], [x0 + band, y0 + band], [x0, y0 + band]], pal.ochre, { nib: 0.18 });
    P.dot(x0 + band / 2, y0 + band / 2, 0.55, pal.ink);
  }

  // Graticule degree labels tucked cleanly just inside the neatline
  drawTickLabels(P, o.ticks, inner, pal.tickLabel || '#456473');
}

// Overlapping jagged mountain range chain (style-aware: classic / ink-wash / blueprint / nocturne)
function drawMountainRange(P, peaks, o = {}) {
  const st = styleOf(P);
  const pal = palOf(P);
  const mode = o.style || st?.mountains || 'classic';

  if (mode === 'ink-wash') {
    for (const [cx, by, w, h, snow] of peaks) {
      // Soft rounded Shan-Shui silhouette with mineral celadon & ochre layered wash
      const body = D.curve([
        [cx - w * 1.15, by],
        [cx - w * 0.55, by - h * 0.62],
        [cx, by - h],
        [cx + w * 0.52, by - h * 0.58],
        [cx + w * 1.15, by],
      ], true, 0.28);
      washBloom(P, [body], o.color || pal.mountainLight, { strength: 0.72, edgeAmt: 0.36, cloudAmt: 0.25 });
      // Deeper mineral-green peak crown wash
      const crown = D.curve([
        [cx - w * 0.58, by - h * 0.35],
        [cx - w * 0.28, by - h * 0.78],
        [cx, by - h],
        [cx + w * 0.34, by - h * 0.72],
        [cx + w * 0.62, by - h * 0.30],
        [cx, by - h * 0.42],
      ], true, 0.28);
      washBloom(P, [crown], pal.mountain, { strength: 0.58, edgeAmt: 0.28, cloudAmt: 0.20 });
      // Expressive brush contour & 披麻皴 ridge strokes
      P.curve([[cx - w * 1.1, by], [cx - w * 0.48, by - h * 0.62], [cx, by - h], [cx + w * 0.5, by - h * 0.56], [cx + w * 1.1, by]], {
        nib: 0.22,
        color: pal.ink,
        profile: 'swell',
      });
      P.curve([[cx, by - h * 0.96], [cx - w * 0.14, by - h * 0.48], [cx - w * 0.04, by - h * 0.10]], { nib: 0.14, color: pal.ink });
      P.curve([[cx + w * 0.12, by - h * 0.75], [cx + w * 0.28, by - h * 0.35], [cx + w * 0.42, by - h * 0.08]], { nib: 0.11, color: pal.ink });
      if (snow) {
        const cap = [[cx, by - h], [cx + w * 0.28, by - h * 0.66], [cx + w * 0.08, by - h * 0.56], [cx - w * 0.12, by - h * 0.66], [cx - w * 0.28, by - h * 0.64]];
        wash(P, [cap], pal.snow, { strength: 0.72, toothAmt: 0.25 });
      }
    }
    return;
  }

  if (mode === 'blueprint' || mode === 'nocturne') {
    for (const [cx, by, w, h, snow] of peaks) {
      const body = [[cx - w, by], [cx - w * 0.45, by - h * 0.52], [cx, by - h], [cx + w * 0.48, by - h * 0.48], [cx + w, by]];
      wash(P, [body], o.color || pal.mountainLight, { strength: 0.52, toothAmt: 0.22 });
      P.hatch([body], {
        clip: [[[cx, by - h - 1], [cx + w + 1, by - h - 1], [cx + w + 1, by + 1], [cx, by + 1]]],
        angle: 56,
        pitch: 0.72,
        nib: 0.10,
        color: pal.borderAccent,
      });
      P.ink([[cx - w, by], [cx - w * 0.45, by - h * 0.52], [cx, by - h], [cx + w * 0.48, by - h * 0.48], [cx + w, by]], { nib: 0.18, color: pal.ink });
      P.ink([[cx, by - h], [cx - w * 0.08, by - h * 0.42], [cx + w * 0.1, by - h * 0.08]], { nib: 0.11, color: pal.borderAccent });
      if (snow) {
        const cap = [[cx, by - h], [cx + w * 0.30, by - h * 0.64], [cx + w * 0.08, by - h * 0.54], [cx - w * 0.12, by - h * 0.64], [cx - w * 0.30, by - h * 0.62]];
        wash(P, [cap], pal.snow, { strength: 0.62, toothAmt: 0.2 });
      }
    }
    return;
  }

  for (const [cx, by, w, h, snow] of peaks) {
    const body = [[cx - w, by], [cx - w * 0.45, by - h * 0.52], [cx, by - h], [cx + w * 0.48, by - h * 0.48], [cx + w, by]];
    part(P, body, o.color || pal.mountainLight, {
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
      part(P, cap, pal.snow, { nib: 0.11, pressure: 0.35, passes: 1 });
    }
  }
}

// Terraced green rice paddy fields
function drawRiceFields(P, cx, cy, w = 14, h = 6) {
  const pal = palOf(P);
  const poly = D.curve([[cx - w / 2, cy], [cx - w * 0.3, cy - h / 2], [cx + w * 0.3, cy - h * 0.45], [cx + w / 2, cy + 0.8], [cx + w * 0.2, cy + h / 2], [cx - w * 0.35, cy + h * 0.45]]);
  part(P, poly, styleOf(P)?.isDark ? pal.forest : '#b8d18a', { nib: 0.14, pressure: 0.65 });
  for (let i = -2; i <= 2; i++) {
    const yy = cy + i * (h * 0.18);
    P.curve([[cx - w * 0.38, yy], [cx, yy - 0.6], [cx + w * 0.38, yy + 0.3]], { nib: 0.09, color: styleOf(P)?.isDark ? pal.ink : '#587842' });
  }
}

// Gentle sea wave squiggles
function drawWaves(P, x, y, s = 1, count = 2) {
  const pal = palOf(P);
  for (let i = 0; i < count; i++) {
    const yy = y + i * 2.0 * s;
    const ox = i * 2.0 * s;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      pts.push([x + ox + t * 12 * s, yy + Math.sin(t * Math.PI * 3) * 0.68 * s]);
    }
    P.ink(pts, { nib: 0.12, color: pal.waterline || '#6992a6' });
  }
}

// Winding river
function drawRiver(P, ctrlPts, o = {}) {
  const pal = palOf(P);
  P.curve(ctrlPts, { nib: o.nib ?? 0.42, color: o.color || pal.river });
}

// Dashed railway / maritime route
function drawRoute(P, ctrlPts, o = {}) {
  const pal = palOf(P);
  const pts = D.resample(D.curve(ctrlPts, false, 0.35), 1.2);
  for (let i = 0; i < pts.length - 2; i += 3) {
    P.ink([pts[i], pts[i + 1]], { nib: o.nib ?? 0.18, color: o.color || pal.crimson });
  }
}

// Delicate curved pointer line connecting an offshore vignette to its bay/region
function drawCallout(P, fromPt, toPt, o = {}) {
  const pal = palOf(P);
  const mx = (fromPt[0] + toPt[0]) / 2 + (o.bendX ?? 0);
  const my = (fromPt[1] + toPt[1]) / 2 + (o.bendY ?? -2.2);
  const pts = D.resample(D.curve([fromPt, [mx, my], toPt], false, 0.35), 1.0);
  for (let i = 0; i < pts.length - 1; i += 2) {
    P.ink([pts[i], pts[Math.min(pts.length - 1, i + 1)]], { nib: 0.11, color: o.color || pal.callout || '#6a5d52' });
  }
}

// City marker dot + crisp cartographic label
function drawCity(P, x, y, name, o = {}) {
  const pal = palOf(P);
  const capCol = pal.crimson;
  const cityCol = pal.ink;
  P.paper([D.ell(x, y, 1.25, 1.25)]);
  P.dot(x, y, o.capital ? 1.35 : 0.85, o.capital ? capCol : cityCol);
  if (o.capital) P.outline([D.ell(x, y, 2.0, 2.0)], { nib: 0.16, color: capCol });
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
      color: o.color || (capital ? capCol : cityCol),
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
  const st = styleOf(P);
  const pal = palOf(P);
  const mode = o.style || st?.compass || 'classic';
  const rotA = o.angle ?? 0;
  const T = at(cx, cy, 1, rotA);

  // Subtle nautical rhumb lines radiating softly in the sea behind compass
  if (o.rhumb !== false) {
    const rhumbOuter = mode === 'blueprint' || mode === 'celestial' ? r * 3.8 : r * 2.9;
    const rhumbCol = mode === 'blueprint' || mode === 'celestial' ? pal.graticule : (pal.waterlineOuter || '#8baabf');
    for (let i = 0; i < 8; i++) {
      const a = rotA + (i * Math.PI) / 4;
      P.ink([
        [cx + Math.cos(a) * (r * 1.35), cy + Math.sin(a) * (r * 1.35)],
        [cx + Math.cos(a) * rhumbOuter, cy + Math.sin(a) * rhumbOuter],
      ], { nib: 0.08, color: rhumbCol });
    }
  }

  if (st?.isDark) {
    wash(P, [D.ell(cx, cy, r * 1.12, r * 1.12)], pal.cream, { strength: 0.82, toothAmt: 0.22 });
  } else {
    P.paper([D.ell(cx, cy, r * 1.12, r * 1.12)]);
  }
  P.outline([D.ell(cx, cy, r * 0.94, r * 0.94)], { nib: 0.15, color: pal.ink });
  P.outline([D.ell(cx, cy, r * 0.78, r * 0.78)], { nib: 0.09, color: pal.borderAccent || pal.ink });

  // Secondary 4-point star
  const subStar = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 4 + (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? r * 0.72 : r * 0.22;
    subStar.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  part(P, T(subStar), pal.slate, { nib: 0.12, pressure: 0.55, hatchFill: false });

  // Main 4-point star
  const star = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? r * 1.05 : r * 0.26;
    star.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  part(P, T(star), pal.ochre, { nib: 0.18, pressure: 0.75, hatchFill: false });
  // Crimson / Gold North needle
  part(P, T([[0, -r * 1.06], [r * 0.2, -r * 0.22], [0, 0], [-r * 0.2, -r * 0.22]]), pal.crimson, { nib: 0.15, hatchFill: false });

  const [nx, ny] = T([[0, -r * 1.34]])[0];
  const [sx, sy] = T([[0, r * 1.42]])[0];
  const [ex, ey] = T([[r * 1.36, 0.6]])[0];
  const [wx, wy] = T([[-r * 1.38, 0.6]])[0];
  P.text('N', nx, ny + 1.0, { face: 'serif-bold', size: 3.1, align: 'center', color: pal.crimson });
  P.text('S', sx, sy + 0.9, { face: 'serif-bold', size: 2.3, align: 'center', color: pal.ink });
  P.text('E', ex, ey + 0.6, { face: 'serif-bold', size: 2.3, align: 'center', color: pal.ink });
  P.text('W', wx, wy + 0.6, { face: 'serif-bold', size: 2.3, align: 'center', color: pal.ink });
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

// Traditional Chinese vermilion square seal stamp (朱红印章) for ink-wash cartouches
function drawSealStamp(P, cx, cy, sz, pal) {
  const half = sz / 2;
  const box = D.rrect(cx - half, cy - half, cx + half, cy + half, 0.5);
  washBloom(P, [box], pal.crimson, { strength: 0.88, toothAmt: 0.42, edgeAmt: 0.25, cloudAmt: 0.15 });
  P.outline([box], { nib: 0.16, color: pal.crimson });
  // Crisp seal-script style inner frame & geometric character glyph in paper-cream
  const pad = sz * 0.16;
  P.ink([
    [cx - half + pad, cy - half + pad],
    [cx + half - pad, cy - half + pad],
    [cx + half - pad, cy + half - pad],
    [cx - half + pad, cy + half - pad],
    [cx - half + pad, cy - half + pad],
  ], { nib: 0.11, color: pal.cream, tremor: 0.35 });
  P.ink([[cx, cy - half + pad * 1.4], [cx, cy + half - pad * 1.4]], { nib: 0.11, color: pal.cream, tremor: 0.35 });
  P.ink([[cx - half + pad * 1.6, cy], [cx + half - pad * 1.6, cy]], { nib: 0.11, color: pal.cream, tremor: 0.35 });
}

// Framed Parchment / Blueprint / Nocturne / Scroll Cartouche
function drawCartouche(P, x, y, w, h, info = {}) {
  const st = styleOf(P);
  const pal = palOf(P);
  const mode = info.style || st?.cartouche || 'parchment';

  if (mode === 'blueprint') {
    const outer = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const inner = [[x + 1.4, y + 1.4], [x + w - 1.4, y + 1.4], [x + w - 1.4, y + h - 1.4], [x + 1.4, y + h - 1.4]];
    wash(P, [outer], pal.cream, { reset: true, strength: 0.90, toothAmt: 0.22 });
    P.ink([...outer, outer[0]], { nib: 0.30, color: pal.ink });
    P.ink([...inner, inner[0]], { nib: 0.12, color: pal.borderAccent });
    // Technical corner registration ticks
    for (const [rx, ry] of [[x + 3.0, y + 3.0], [x + w - 3.0, y + 3.0], [x + 3.0, y + h - 3.0], [x + w - 3.0, y + h - 3.0]]) {
      P.ink([[rx - 0.8, ry], [rx + 0.8, ry]], { nib: 0.10, color: pal.borderAccent });
      P.ink([[rx, ry - 0.8], [rx, ry + 0.8]], { nib: 0.10, color: pal.borderAccent });
    }
  } else if (mode === 'nocturne') {
    const outer = D.rrect(x, y, x + w, y + h, 1.5);
    const inner = D.rrect(x + 1.5, y + 1.5, x + w - 1.5, y + h - 1.5, 1.0);
    wash(P, [outer], pal.cream, { reset: true, strength: 0.92, toothAmt: 0.22 });
    P.outline([outer], { nib: 0.28, color: pal.borderAccent });
    P.outline([inner], { nib: 0.12, color: pal.ink });
    for (const [rx, ry] of [[x + 3.0, y + 3.0], [x + w - 3.0, y + 3.0], [x + 3.0, y + h - 3.0], [x + w - 3.0, y + h - 3.0]]) {
      P.dot(rx, ry, 0.55, pal.borderAccent);
    }
  } else if (mode === 'scroll') {
    const outer = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const inner = [[x + 1.4, y + 1.4], [x + w - 1.4, y + 1.4], [x + w - 1.4, y + h - 1.4], [x + 1.4, y + h - 1.4]];
    washBloom(P, [outer], pal.cream, { reset: true, strength: 0.92, toothAmt: 0.36, edgeAmt: 0.18, cloudAmt: 0.14 });
    P.ink([...outer, outer[0]], { nib: 0.38, color: pal.ink });
    P.ink([...inner, inner[0]], { nib: 0.12, color: pal.ink });
    // Vermilion seal stamp tucked neatly in bottom-right corner
    if (w >= 48 && h >= 28) {
      drawSealStamp(P, x + w - 7.5, y + h - 7.5, 6.4, pal);
    }
  } else {
    // Subtle drop shadow hatch
    P.hatch([D.rrect(x + 1.4, y + 1.4, x + w + 1.4, y + h + 1.4, 1.5)], { angle: 45, pitch: 0.65, nib: 0.1, color: pal.shadow || '#5c5349' });
    // Parchment card + double inner hairline
    part(P, D.rrect(x, y, x + w, y + h, 1.5), pal.cream, { nib: 0.28, pressure: 0.55 });
    P.outline([D.rrect(x + 1.5, y + 1.5, x + w - 1.5, y + h - 1.5, 1.0)], { nib: 0.12, color: pal.ink });
    // Brass corner rivets
    for (const [rx, ry] of [[x + 3.0, y + 3.0], [x + w - 3.0, y + 3.0], [x + 3.0, y + h - 3.0], [x + w - 3.0, y + h - 3.0]]) {
      P.dot(rx, ry, 0.55, pal.ochre);
    }
  }

  // Country Title + Waving National Flag (auto-scale/truncate title so CJK/long titles never collide with flag)
  if (info.country) {
    const baseTitleSize = info.titleSize ?? 9.2;
    const maxTitleW = info.flag ? Math.max(4, w - 28.0) : Math.max(4, w - 11.0);
    const { text: fittedTitle, size: titleSize } = fitTextToWidth(info.country, 'serif-bold', baseTitleSize, maxTitleW, 1.8);
    P.text(fittedTitle, x + 5.5, y + 12.2, { face: 'serif-bold', size: titleSize, align: 'left', color: pal.ink });
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
        color: pal.crimson,
        slant: 0.22,
        layout: 'inline',
        sep,
      });
    } else if (fittedSub.startsWith(prefix)) {
      P.writeBilingual(info.subtitle, fittedSub.slice(prefix.length), x + 5.8, y + 16.4, {
        face: 'serif-bold',
        size: subSize,
        align: 'left',
        color: pal.crimson,
        slant: 0.22,
        layout: 'inline',
        sep,
      });
    } else {
      P.italic(fittedSub, x + 5.8, y + 16.4, { face: 'serif-bold', size: subSize, align: 'left', color: pal.crimson });
    }
  } else if (info.subtitle || secondarySub) {
    const subText = info.subtitle || secondarySub;
    const { text: fittedSub, size: subSize } = fitTextToWidth(subText, 'serif-bold', 2.7, maxSubW, 1.5);
    P.italic(fittedSub, x + 5.8, y + 16.4, { face: 'serif-bold', size: subSize, align: 'left', color: pal.crimson });
  }

  // Divider line
  P.ink([[x + 5, y + 18.6], [x + w - 5, y + 18.6]], { nib: 0.12, color: pal.divider || '#9c8e7b' });

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
    P.text(txt, x + 5.5, y + 23.0 + i * 4.2, { face: 'sans-bold', size: 2.25, align: 'left', color: pal.ink });
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
      P.dot(lx, ly, 1.1, item.color || pal.crimson);
      P.outline([D.ell(lx, ly, 1.7, 1.7)], { nib: 0.13, color: item.color || pal.crimson });
    } else if (item.symbol === 'city') {
      P.dot(lx, ly + 0.1, 0.8, item.color || pal.ink);
    } else if (item.symbol === 'river') {
      P.ink([[lx - 2.0, ly], [lx + 2.2, ly]], { nib: 0.36, color: item.color || pal.river });
    } else {
      P.ink([[lx - 2.0, ly], [lx - 0.3, ly]], { nib: 0.2, color: item.color || pal.navy });
      P.ink([[lx + 0.7, ly], [lx + 2.2, ly]], { nib: 0.2, color: item.color || pal.navy });
    }
    P.text(item.label, lx + 3.2, ly + 0.7, { face: 'sans', size: 2.15, align: 'left', color: pal.ink });
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
    part(P, [[bx, sy], [bx + seg, sy], [bx + seg, sy + 1.4], [bx, sy + 1.4]], k % 2 === 0 ? pal.ink : pal.paper, { nib: 0.12, hatchFill: false });
    P.text(String(k * unit), bx, sy - 0.8, { face: 'sans', size: 1.85, align: 'center', color: pal.ink });
  }
  P.text(`${3 * unit} km`, sx0 + 3 * seg, sy - 0.8, { face: 'sans-bold', size: 1.85, align: 'center', color: pal.ink });
}

// Framed Inset Map Box (e.g., Ryukyu / Okinawa Islands)
function drawInsetBox(P, x, y, w, h, title) {
  const pal = palOf(P);
  const box = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  wash(P, [box], pal.ocean, { reset: true, strength: 0.82, toothAmt: 0.38 });
  P.ink([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], { nib: 0.3, color: pal.ink });
  P.ink([[x + 1.1, y + 1.1], [x + w - 1.1, y + 1.1], [x + w - 1.1, y + h - 1.1], [x + 1.1, y + h - 1.1], [x + 1.1, y + 1.1]], { nib: 0.12, color: pal.ink });
  if (title) {
    const baseSize = 2.3;
    const maxTw = Math.max(4, w - 5);
    const measured = Lt.measure(title, 'serif-bold', baseSize);
    const padX = 5.5;
    const tw = Math.min(maxTw, Math.max(Math.min(8, maxTw), measured + padX));
    const maxTextW = Math.max(2, tw - 3.5);
    const { text: fittedTitle, size: fitSize } = fitTextToWidth(title, 'serif-bold', baseSize, maxTextW, 1.2);
    part(P, D.rrect(x + 2.5, y + 2.2, x + 2.5 + tw, y + 7.2, 0.8), pal.cream, { nib: 0.16, hatchFill: false });
    P.text(fittedTitle, x + 2.5 + tw / 2, y + 5.5, { face: 'serif-bold', size: fitSize, align: 'center', color: pal.ink });
  }
  return box;
}

module.exports = {
  PALETTE,
  at,
  part,
  wash,
  washBloom,
  createProjection,
  fitProjection,
  geoRings,
  geoLines,
  clipRing,
  clipRuns,
  simplifyRing,
  simplifyLine,
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
