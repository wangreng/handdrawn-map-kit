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

function shouldOutline(st, o) {
  if (o.outline === false) return false;
  if (o.outline === true) return true;
  if (st?.stroke?.enabled === false) return false;
  return true;
}

function resolveOutlineColor(st, pal, o) {
  if (o.outlineColor) return o.outlineColor;
  if (st?.stroke?.mode === 'tinted' && st.stroke.outlineColor) return st.stroke.outlineColor;
  return pal.ink;
}

function part(P, poly, color, o = {}) {
  const st = styleOf(P);
  const pal = palOf(P);
  const fillMode = o.fillMode || st?.fill?.mode || 'pencil';
  const polys = Array.isArray(poly[0]) && Array.isArray(poly[0][0]) ? poly : [poly];
  const outlineColor = resolveOutlineColor(st, pal, o);
  const doOutline = shouldOutline(st, o);

  if (fillMode === 'paper-cut') {
    if (color) {
      cutPaperLayer(P, polys, color, {
        elevation: o.elevation ?? st?.fill?.elevation ?? 1.4,
        shadowDark: o.shadowDark ?? st?.fill?.shadowDark ?? 0.34,
        rimLight: o.rimLight ?? st?.fill?.rimLight ?? 0.28,
        rimShade: o.rimShade ?? st?.fill?.rimShade ?? 0.22,
        clip: o.clip,
        cut: o.cut,
      });
    }
    if (o.outline === true) {
      P.outline(polys, { nib: o.nib ?? 0.18, clip: o.clip, cut: o.cut, color: outlineColor });
    }
    return;
  }

  if (fillMode === 'gouache') {
    if (color) {
      fillDryGouache(P, polys, color, {
        altColor: o.altColor,
        angle: o.angle ?? st?.fill?.angle ?? -14,
        opacity: o.opacity ?? st?.fill?.opacity ?? 0.96,
        streakAmt: o.streakAmt ?? st?.fill?.streakAmt ?? 0.26,
        dryEdgeMm: o.dryEdgeMm ?? st?.fill?.dryEdgeMm ?? 0.9,
        clip: o.clip,
        cut: o.cut,
      });
    }
    if (doOutline) {
      P.outline(polys, { nib: o.nib ?? 0.22, clip: o.clip, cut: o.cut, color: outlineColor });
    }
    return;
  }

  if (fillMode === 'soft-grain') {
    if (color) {
      fillSoftGrain(P, polys, color, {
        shadeColor: o.shadeColor,
        grainAmt: o.grainAmt ?? st?.fill?.grainAmt ?? 0.24,
        opacity: o.opacity ?? st?.fill?.opacity ?? 0.96,
        clip: o.clip,
        cut: o.cut,
      });
    }
    if (doOutline) {
      P.outline(polys, { nib: o.nib ?? 0.22, clip: o.clip, cut: o.cut, color: outlineColor });
    }
    return;
  }

  if (fillMode === 'collage') {
    if (color) {
      fillCollage(P, polys, color, {
        pattern: o.pattern ?? st?.fill?.pattern ?? 'linen',
        patternColor: o.patternColor,
        angle: o.angle ?? 32,
        pitch: o.pitch ?? st?.fill?.pitch ?? 2.2,
        strength: o.strength ?? st?.fill?.strength ?? 0.90,
        toothAmt: o.toothAmt ?? st?.fill?.toothAmt ?? 0.30,
        cutShadow: o.cutShadow ?? st?.fill?.cutShadow ?? false,
        clip: o.clip,
        cut: o.cut,
      });
    }
    if (doOutline) {
      P.outline(polys, { nib: o.nib ?? 0.22, clip: o.clip, cut: o.cut, color: outlineColor });
    }
    return;
  }

  if (fillMode === 'watercolor') {
    P.paper(polys, { clip: o.clip, cut: o.cut });
    if (color) {
      fillWatercolorMultiply(P, polys, color, {
        color2: o.color2,
        strength: o.strength ?? st?.fill?.strength ?? 0.58,
        granulation: o.granulation ?? st?.fill?.granulation ?? 0.44,
        backrunAmt: o.backrunAmt ?? st?.fill?.backrunAmt ?? 0.34,
        cloudAmt: o.cloudAmt ?? st?.fill?.cloudAmt ?? 0.28,
        clip: o.clip,
        cut: o.cut,
      });
    }
    if (o.shade) {
      P.hatch(polys, { clip: [o.shade], angle: o.hatch ?? 58, pitch: o.pitch ?? 0.55, nib: 0.10, color: outlineColor });
    }
    if (doOutline) {
      P.outline(polys, { nib: o.nib ?? 0.20, clip: o.clip, cut: o.cut, color: outlineColor });
    }
    return;
  }

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
    if (doOutline) {
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
    if (doOutline) {
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
  if (doOutline) {
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
  const obliqueCfg = o.oblique === true
    ? { shearX: 0.10, scaleY: 0.92 }
    : (o.oblique && typeof o.oblique === 'object' ? o.oblique : null);
  const shearX = obliqueCfg ? (obliqueCfg.shearX ?? 0.10) : 0;
  const scaleY = obliqueCfg ? (obliqueCfg.scaleY ?? 0.92) : 1;

  const wrap = (dLon) => (dLon > 180 ? dLon - 360 : dLon < -180 ? dLon + 360 : dLon);
  const project = (dLon, lat) => {
    const xk = dLon * KM_PER_DEG_LON * Math.cos((lat * Math.PI) / 180);
    const yk = -(lat - lat0) * KM_PER_DEG_LAT;
    const xr = xk * Math.cos(a) - yk * Math.sin(a);
    const yr = xk * Math.sin(a) + yk * Math.cos(a);
    const sx = xr * scale;
    const sy = yr * scale;
    return [cx + sx + sy * shearX, cy + sy * scaleY];
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
    const sy = (y - cy) / scaleY;
    const sx = (x - cx) - sy * shearX;
    const xr = sx / scale, yr = sy / scale;
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
  fn.params = { lon0, lat0, cx, cy, scale, rotDeg: o.rotDeg ?? 26, oblique: obliqueCfg };
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
  const unit = createProjection({ lon0, lat0, cx: 0, cy: 0, scale: 1, rotDeg, oblique: o.oblique });
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
    oblique: o.oblique,
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

function boxBlurFloat(src, W, H, r) {
  if (r <= 0) return Float32Array.from(src);
  const tmp = new Float32Array(W * H);
  const dst = new Float32Array(W * H);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[o + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[o + x] = acc * k;
      acc += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = acc * k;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return dst;
}

// Natural irregular hand-painted organic blob polygon (avoids geometric ellipses in watercolor/gouache washes)
function organicBlob(cx, cy, rx, ry, seedStr = 'blob', n = 22) {
  const { rng } = require('../engine/kit/util');
  const R = rng(`blob:${seedStr}`);
  const pts = [];
  const p1 = R() * Math.PI * 2;
  const p2 = R() * Math.PI * 2;
  const p3 = R() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const mod = 1 + 0.18 * Math.sin(2 * a + p1) + 0.13 * Math.cos(3 * a + p2) + 0.08 * Math.sin(5 * a + p3);
    pts.push([cx + Math.cos(a) * rx * mod, cy + Math.sin(a) * ry * mod]);
  }
  return D.curve(pts, true, 0.35);
}

function resolveMask(S, polys, o) {
  const m = o.mask || MK.maskOf(S, polys);
  if (o.cut) MK.subtract(S, m, o.cut);
  if (o.clip) {
    const c = MK.maskOf(S, o.clip);
    for (let i = 0; i < m.length; i++) m[i] &= c[i];
  }
  return m;
}

// 1. Procedural vintage paper collage fill (City Atlas): halftone dots, stripes, woven linen, crosshatch, speckle + cut-paper micro-shadow
function fillCollage(P, polys, hexColor, o = {}) {
  const { hexToRgb, rng, clamp } = require('../engine/kit/util');
  const { W, H, ppm, rgb, tooth } = P.S;
  const col = hexToRgb(hexColor);
  const patCol = o.patternColor ? hexToRgb(o.patternColor) : col.map((v) => clamp(v * 0.78, 0, 255));
  const pattern = o.pattern || 'solid';
  const m = resolveMask(P.S, polys, o);
  const bb = MK.bboxOf(P.S, m);
  if (!bb) return m;
  const R = rng(`${P.S.seed}:collage:${hexColor}:${pattern}:${bb.x0}:${bb.y0}`);
  const strength = o.strength ?? 0.90;
  const toothAmt = o.toothAmt ?? 0.30;
  const angle = ((o.angle ?? 32) * Math.PI) / 180;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const pitch = (o.pitch ?? 2.2) * ppm;

  if (o.cutShadow) {
    const shOffX = Math.round(0.55 * ppm);
    const shOffY = Math.round(0.65 * ppm);
    for (let y = bb.y0; y <= bb.y1; y++) {
      const sy = y + shOffY;
      if (sy < 0 || sy >= H) continue;
      for (let x = bb.x0; x <= bb.x1; x++) {
        if (!m[y * W + x]) continue;
        const sx = x + shOffX;
        if (sx < 0 || sx >= W || m[sy * W + sx]) continue;
        const j = 3 * (sy * W + sx);
        rgb[j] *= 0.80; rgb[j + 1] *= 0.79; rgb[j + 2] *= 0.77;
      }
    }
  }

  for (let y = bb.y0; y <= bb.y1; y++) {
    const row = y * W;
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = row + x;
      if (!m[i]) continue;
      const t = tooth[i];
      const grain = (R() - 0.5) * 8;
      let pr = col[0], pg = col[1], pb = col[2];
      let pat = 0;

      if (pattern === 'stripes') {
        const u = (((x * ca + y * sa) % pitch) + pitch) % pitch;
        if (u < pitch * 0.28) pat = 0.24;
      } else if (pattern === 'dots') {
        const gx = (((x % pitch) + pitch) % pitch) - pitch * 0.5;
        const gy = (((y % pitch) + pitch) % pitch) - pitch * 0.5;
        if (gx * gx + gy * gy < (pitch * 0.22) ** 2) pat = 0.28;
      } else if (pattern === 'linen') {
        const step = Math.max(2, Math.round(pitch * 0.45));
        if (x % step === 0 || y % step === 0) pat = 0.16;
      } else if (pattern === 'cross') {
        const u = (((x * ca + y * sa) % pitch) + pitch) % pitch;
        const v = (((-x * sa + y * ca) % pitch) + pitch) % pitch;
        if (u < 1.3 || v < 1.3) pat = 0.18;
      } else if (pattern === 'speckle') {
        if (R() < 0.08) pat = 0.30;
      }

      if (pat > 0) {
        pr = pr * (1 - pat) + patCol[0] * pat;
        pg = pg * (1 - pat) + patCol[1] * pat;
        pb = pb * (1 - pat) + patCol[2] * pat;
      }
      const a = clamp(strength * (1 - toothAmt * (t - 0.5)), 0, 1);
      const j = 3 * i;
      rgb[j] += (clamp(pr + grain, 0, 255) - rgb[j]) * a;
      rgb[j + 1] += (clamp(pg + grain, 0, 255) - rgb[j + 1]) * a;
      rgb[j + 2] += (clamp(pb + grain, 0, 255) - rgb[j + 2]) * a;
    }
  }
  return m;
}

// 2. Opaque dry-brush gouache fill (Atlas of Adventures): bristle streaks, optional vertical gradient & dry-tooth edge breakup
function fillDryGouache(P, polys, hexColor, o = {}) {
  const { hexToRgb, rng, clamp } = require('../engine/kit/util');
  const { W, H, ppm, rgb, tooth } = P.S;
  const col = hexToRgb(hexColor);
  const altCol = o.altColor ? hexToRgb(o.altColor) : col.map((v) => clamp(v * 0.88 + 14, 0, 255));
  const botCol = o.bottomColor ? hexToRgb(o.bottomColor) : null;
  const m = resolveMask(P.S, polys, o);
  const bb = MK.bboxOf(P.S, m);
  if (!bb) return m;

  const angle = ((o.angle ?? -12) * Math.PI) / 180;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const R = rng(`${P.S.seed}:gouache:${hexColor}:${bb.x0}:${bb.y0}`);
  const laneN = 512;
  const lane = new Float32Array(laneN);
  for (let i = 0; i < laneN; i++) lane[i] = R() * 2 - 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < laneN; i++) {
      lane[i] = (lane[(i + laneN - 1) % laneN] + lane[i] * 2 + lane[(i + 1) % laneN]) * 0.25;
    }
  }

  const dryEdgeMm = o.dryEdgeMm ?? 1.4;
  const edgeR = dryEdgeMm > 0 ? Math.max(2, Math.round(dryEdgeMm * ppm)) : 0;
  const opac = o.opacity ?? 0.94;
  const streakAmt = o.streakAmt ?? 0.24;
  const bh = Math.max(1, bb.y1 - bb.y0);

  for (let y = bb.y0; y <= bb.y1; y++) {
    const row = y * W;
    const gy = (y - bb.y0) / bh;
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = row + x;
      if (!m[i]) continue;
      let nearEdge = 0;
      if (edgeR > 0) {
        const ex1 = Math.round(x + ca * edgeR), ey1 = Math.round(y + sa * edgeR);
        const ex2 = Math.round(x - ca * edgeR), ey2 = Math.round(y - sa * edgeR);
        if (ex1 < 0 || ex1 >= W || ey1 < 0 || ey1 >= H || !m[ey1 * W + ex1]) nearEdge = 1;
        else if (ex2 < 0 || ex2 >= W || ey2 < 0 || ey2 >= H || !m[ey2 * W + ex2]) nearEdge = 1;
      }

      const u = (-x * sa + y * ca) * 0.55;
      const v = (x * ca + y * sa) * 0.04;
      const idx = (((Math.floor(u) + Math.floor(v)) % laneN) + laneN) % laneN;
      const b = lane[idx];
      const t = tooth[i];

      let alpha = opac;
      if (nearEdge) {
        const dryTest = b * 0.7 + (t - 0.5) * 1.1;
        if (dryTest < -0.18) continue;
        alpha *= clamp(0.45 + (dryTest + 0.2) * 0.9, 0.2, 1);
      } else {
        alpha *= clamp(0.88 + 0.16 * t + 0.14 * b, 0.55, 1);
      }

      const baseR = botCol ? col[0] + (botCol[0] - col[0]) * gy : col[0];
      const baseG = botCol ? col[1] + (botCol[1] - col[1]) * gy : col[1];
      const baseB = botCol ? col[2] + (botCol[2] - col[2]) * gy : col[2];
      const mix = clamp(0.5 + b * streakAmt * 2.2, 0, 1);
      const cr = baseR + (altCol[0] - col[0]) * (mix - 0.5);
      const cg = baseG + (altCol[1] - col[1]) * (mix - 0.5);
      const cb = baseB + (altCol[2] - col[2]) * (mix - 0.5);
      const j = 3 * i;
      rgb[j] += (clamp(cr, 0, 255) - rgb[j]) * alpha;
      rgb[j + 1] += (clamp(cg, 0, 255) - rgb[j + 1]) * alpha;
      rgb[j + 2] += (clamp(cb, 0, 255) - rgb[j + 2]) * alpha;
    }
  }
  return m;
}

// 3. Dry-brush sweeping gouache stroke (for waves, rivers, sunbursts, painterly trails)
function dryBrushStroke(P, pts, hexColor, o = {}) {
  const { hexToRgb, rng, clamp } = require('../engine/kit/util');
  const { W, H, ppm, rgb, tooth } = P.S;
  if (!pts || pts.length < 2) return;
  const col = hexToRgb(hexColor);
  const radius = (o.width ?? 2.0) * 0.5 * ppm;
  const opac = o.opacity ?? 0.88;
  const dryness = o.dryness ?? 0.42;
  const R = rng(`${P.S.seed}:dstroke:${hexColor}:${pts[0][0]}:${pts[0][1]}`);
  const dense = D.resample(pts, 0.45);
  const bristles = 16;
  const bOff = Array.from({ length: bristles }, (_, k) => (k / (bristles - 1)) * 2 - 1);
  const bStrength = Array.from({ length: bristles }, () => 0.45 + R() * 0.65);

  for (let k = 0; k < dense.length - 1; k++) {
    const ax = dense[k][0] * ppm, ay = dense[k][1] * ppm;
    const bx = dense[k + 1][0] * ppm, by = dense[k + 1][1] * ppm;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const tProg = k / Math.max(1, dense.length - 1);
    const fade = Math.sin(Math.PI * tProg) ** 0.35;
    for (let b = 0; b < bristles; b++) {
      if (R() < dryness * (0.2 + 0.5 * Math.abs(bOff[b]))) continue;
      const off = bOff[b] * radius;
      const px = Math.round((ax + bx) * 0.5 + nx * off);
      const py = Math.round((ay + by) * 0.5 + ny * off);
      const br = Math.max(1, Math.round(radius * 0.18));
      for (let yy = py - br; yy <= py + br; yy++) {
        if (yy < 0 || yy >= H) continue;
        for (let xx = px - br; xx <= px + br; xx++) {
          if (xx < 0 || xx >= W) continue;
          const i = yy * W + xx;
          const t = tooth[i];
          if (t < dryness * 0.42) continue;
          const a = clamp(opac * fade * bStrength[b] * (0.55 + 0.55 * t), 0, 1);
          const j = 3 * i;
          rgb[j] += (col[0] - rgb[j]) * a;
          rgb[j + 1] += (col[1] - rgb[j + 1]) * a;
          rgb[j + 2] += (col[2] - rgb[j + 2]) * a;
        }
      }
    }
  }
}

// 4. Soft-grain flat geometric risograph fill (The 50 States)
function fillSoftGrain(P, polys, hexColor, o = {}) {
  const { hexToRgb, rng, clamp } = require('../engine/kit/util');
  const { W, rgb, tooth } = P.S;
  const col = hexToRgb(hexColor);
  const shadeCol = o.shadeColor ? hexToRgb(o.shadeColor) : col.map((v) => clamp(v * 0.78, 0, 255));
  const m = resolveMask(P.S, polys, o);
  const bb = MK.bboxOf(P.S, m);
  if (!bb) return m;
  const R = rng(`${P.S.seed}:grain:${hexColor}:${bb.x0}:${bb.y0}`);
  const grainAmt = o.grainAmt ?? 0.24;
  const opac = o.opacity ?? 0.96;
  const bw = Math.max(1, bb.x1 - bb.x0);
  const bh = Math.max(1, bb.y1 - bb.y0);

  for (let y = bb.y0; y <= bb.y1; y++) {
    const row = y * W;
    const ny = (y - bb.y0) / bh;
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = row + x;
      if (!m[i]) continue;
      const nx = (x - bb.x0) / bw;
      const grad = clamp((nx * 0.45 + ny * 0.55) * 1.15 - 0.15, 0, 1);
      const stipple = R() < grad * grainAmt * 1.6 ? 1 : 0;
      const speck = (R() - 0.5) * 14 * grainAmt + (tooth[i] - 0.5) * 10;
      const cr = clamp((stipple ? shadeCol[0] : col[0]) + speck, 0, 255);
      const cg = clamp((stipple ? shadeCol[1] : col[1]) + speck, 0, 255);
      const cb = clamp((stipple ? shadeCol[2] : col[2]) + speck, 0, 255);
      const j = 3 * i;
      rgb[j] += (cr - rgb[j]) * opac;
      rgb[j + 1] += (cg - rgb[j + 1]) * opac;
      rgb[j + 2] += (cb - rgb[j + 2]) * opac;
    }
  }
  return m;
}

// 5. True Beer-Lambert multiply transparent watercolor wash with granulation, backruns & optional feathered wet-on-wet bleed
function fillWatercolorMultiply(P, polys, hexColor, o = {}) {
  const { hexToRgb, rng, clamp } = require('../engine/kit/util');
  const { W, H, ppm, rgb, tooth } = P.S;
  const col = hexToRgb(hexColor);
  const col2 = o.color2 ? hexToRgb(o.color2) : col;
  const m = resolveMask(P.S, polys, o);
  const bb = MK.bboxOf(P.S, m);
  if (!bb) return m;

  const strength = o.strength ?? 0.65;
  const granulation = o.granulation ?? 0.42;
  const backrunAmt = o.backrunAmt ?? 0.36;
  const cloudAmt = o.cloudAmt ?? 0.30;
  const featherMm = o.featherMm ?? 0;
  const clipMask = o.clipMask || null;

  const padPx = featherMm > 0 ? Math.ceil(featherMm * ppm * 2.2) + 2 : 0;
  const x0 = Math.max(0, bb.x0 - padPx), y0 = Math.max(0, bb.y0 - padPx);
  const x1 = Math.min(W - 1, bb.x1 + padPx), y1 = Math.min(H - 1, bb.y1 + padPx);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

  let alphaField = null;
  if (featherMm > 0) {
    const src = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      const sRow = (y + y0) * W, dRow = y * bw;
      for (let x = 0; x < bw; x++) src[dRow + x] = m[sRow + x + x0];
    }
    const r = Math.max(2, Math.round(featherMm * ppm));
    alphaField = boxBlurFloat(boxBlurFloat(src, bw, bh, r), bw, bh, Math.max(1, Math.round(r * 0.7)));
  }

  const cell1 = Math.max(6, Math.round(16 * ppm));
  const cell2 = Math.max(3, Math.round(5.5 * ppm));
  const makeGrid = (cell, tag) => {
    const gw = Math.ceil(bw / cell) + 3, gh = Math.ceil(bh / cell) + 3;
    const R = rng(`${P.S.seed}:wc:${tag}:${hexColor}:${x0}:${y0}`);
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = R() * 2 - 1;
    return { g, gw, inv: 1 / cell };
  };
  const g1 = makeGrid(cell1, 'c1');
  const g2 = makeGrid(cell2, 'c2');
  const sampleG = (G, dx, dy) => {
    const fx = dx * G.inv, fy = dy * G.inv;
    const gx0 = Math.floor(fx), gy0 = Math.floor(fy);
    const tx = fx - gx0, ty = fy - gy0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = G.g[gy0 * G.gw + gx0], b = G.g[gy0 * G.gw + gx0 + 1];
    const c = G.g[(gy0 + 1) * G.gw + gx0], d = G.g[(gy0 + 1) * G.gw + gx0 + 1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };

  const edgeR = Math.max(2, Math.round(1.5 * ppm));
  for (let y = y0; y <= y1; y++) {
    const row = y * W;
    const dy = y - y0;
    for (let x = x0; x <= x1; x++) {
      const i = row + x;
      if (clipMask && !clipMask[i]) continue;
      const dx = x - x0;
      const cov = alphaField ? alphaField[dy * bw + dx] : m[i];
      if (cov <= 0.01) continue;

      const n1 = sampleG(g1, dx, dy);
      const n2 = sampleG(g2, dx, dy);
      const cloud = n1 * 0.65 + n2 * 0.35;

      let nearEdge = 0;
      if (backrunAmt > 0 && !alphaField) {
        const xm = x - edgeR, xp = x + edgeR, ym = y - edgeR, yp = y + edgeR;
        if (xm < 0 || xp >= W || ym < 0 || yp >= H || !m[row + xm] || !m[row + xp] || !m[ym * W + x] || !m[yp * W + x]) {
          nearEdge = 1;
        }
      } else if (backrunAmt > 0 && alphaField) {
        if (cov > 0.15 && cov < 0.60) nearEdge = 0.65 * Math.sin(((cov - 0.15) / 0.45) * Math.PI);
      }

      const pmix = clamp(0.5 + n1 * 0.55, 0, 1);
      const pr = col[0] + (col2[0] - col[0]) * pmix;
      const pg = col[1] + (col2[1] - col[1]) * pmix;
      const pb = col[2] + (col2[2] - col[2]) * pmix;

      const t = tooth[i];
      const gran = 1 + granulation * (0.5 - t);
      const density = clamp(cov * strength * gran * (1 + cloud * cloudAmt) * (1 + nearEdge * backrunAmt * 0.65), 0, 1.35);

      const j = 3 * i;
      rgb[j] *= Math.pow(clamp(pr / 255, 0.04, 1), density);
      rgb[j + 1] *= Math.pow(clamp(pg / 255, 0.04, 1), density);
      rgb[j + 2] *= Math.pow(clamp(pb / 255, 0.04, 1), density);
    }
  }
  return m;
}

// 6. Multi-layer paper-cut bas-relief compositor (If You Lived Here): directional studio shadow + lit bevel + cardstock grain
function cutPaperLayer(P, polys, hexColor, o = {}) {
  const { hexToRgb, rng, clamp } = require('../engine/kit/util');
  const { W, H, ppm, rgb, tooth } = P.S;
  const col = hexToRgb(hexColor);
  const m = resolveMask(P.S, polys, o);
  const bb = MK.bboxOf(P.S, m);
  if (!bb) return m;

  const elevation = o.elevation ?? 1.4;
  const dxPx = Math.round(elevation * 0.85 * ppm);
  const dyPx = Math.round(elevation * 1.05 * ppm);
  const blurR = Math.max(1, Math.round(elevation * 0.62 * ppm));
  const shadowDark = o.shadowDark ?? 0.34;
  const rimLight = o.rimLight ?? 0.26;
  const rimShade = o.rimShade ?? 0.22;
  const invertShadow = !!o.invertShadow;

  if (shadowDark > 0 && elevation > 0) {
    const padPx = Math.max(Math.abs(dxPx), Math.abs(dyPx)) + blurR * 2 + 4;
    const x0 = Math.max(0, bb.x0 - padPx), y0 = Math.max(0, bb.y0 - padPx);
    const x1 = Math.min(W - 1, bb.x1 + padPx), y1 = Math.min(H - 1, bb.y1 + padPx);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    const shSrc = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      const sy = y + y0 - dyPx;
      if (sy < 0 || sy >= H) continue;
      const sRow = sy * W, dRow = y * bw;
      for (let x = 0; x < bw; x++) {
        const sx = x + x0 - dxPx;
        if (sx < 0 || sx >= W) continue;
        shSrc[dRow + x] = m[sRow + sx];
      }
    }
    const shBlur = boxBlurFloat(boxBlurFloat(shSrc, bw, bh, blurR), bw, bh, Math.max(1, Math.round(blurR * 0.7)));

    for (let y = 0; y < bh; y++) {
      const py = y + y0;
      const wRow = py * W, bRow = y * bw;
      for (let x = 0; x < bw; x++) {
        const px = x + x0;
        const wi = wRow + px;
        if (m[wi]) continue;
        const sa = shBlur[bRow + x] * shadowDark;
        if (sa <= 0.004) continue;
        const j = 3 * wi;
        rgb[j] *= 1 - sa * 1.05;
        rgb[j + 1] *= 1 - sa * 1.02;
        rgb[j + 2] *= 1 - sa * 0.90;
      }
    }
  }

  const R = rng(`${P.S.seed}:papercut:${hexColor}:${bb.x0}:${bb.y0}`);
  const bevelPx = Math.max(1, Math.round(0.28 * ppm));
  for (let y = bb.y0; y <= bb.y1; y++) {
    const row = y * W;
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = row + x;
      if (!m[i]) continue;
      const t = tooth[i];
      const lightGrad = (((W - x) / W) * 0.5 + ((H - y) / H) * 0.5 - 0.5) * 14;
      const cardGrain = (t - 0.5) * 16 + (R() - 0.5) * 4;
      let cr = col[0] + lightGrad + cardGrain;
      let cg = col[1] + lightGrad + cardGrain * 0.96;
      let cb = col[2] + lightGrad + cardGrain * 0.92;

      if (!invertShadow && (rimLight > 0 || rimShade > 0)) {
        const ulX = x - bevelPx, ulY = y - bevelPx;
        const brX = x + bevelPx, brY = y + bevelPx;
        const isLitEdge = ulX >= 0 && ulY >= 0 && (!m[ulY * W + x] || !m[row + ulX]);
        const isDarkEdge = brX < W && brY < H && (!m[brY * W + x] || !m[row + brX]);
        if (isLitEdge && rimLight > 0) {
          cr += (255 - cr) * rimLight;
          cg += (252 - cg) * rimLight;
          cb += (244 - cb) * rimLight;
        } else if (isDarkEdge && rimShade > 0) {
          cr *= 1 - rimShade;
          cg *= 1 - rimShade;
          cb *= 1 - rimShade * 0.92;
        }
      }
      const j = 3 * i;
      rgb[j] = clamp(cr, 0, 255);
      rgb[j + 1] = clamp(cg, 0, 255);
      rgb[j + 2] = clamp(cb, 0, 255);
    }
  }
  return m;
}

// Fill ocean background inside frame in ~5ms while preserving full paper fibre texture!
function drawOcean(P, { pad = 5, color, rect: customRect } = {}) {
  const st = styleOf(P);
  const pal = palOf(P);
  const oceanColor = color || pal.ocean;
  const mode = st?.ocean?.mode || 'wash';
  const rect = customRect || [[pad, pad], [P.w - pad, pad], [P.w - pad, P.h - pad], [pad, P.h - pad]];

  if (mode === 'collage') {
    fillCollage(P, [rect], oceanColor, {
      pattern: st.ocean.pattern || 'dots',
      patternColor: st.ocean.patternColor || pal.oceanDeep,
      pitch: st.ocean.pitch ?? 2.6,
      strength: st.ocean.strength ?? 0.92,
    });
    return;
  }

  if (mode === 'gouache') {
    const fullRect = customRect || [[0, 0], [P.w, 0], [P.w, P.h], [0, P.h]];
    fillDryGouache(P, [fullRect], oceanColor, {
      bottomColor: st.ocean.bottomColor || pal.oceanDeep,
      altColor: st.ocean.altColor || pal.oceanShallow,
      angle: st.ocean.angle ?? -5,
      opacity: st.ocean.opacity ?? 0.98,
      streakAmt: st.ocean.streakAmt ?? 0.32,
      dryEdgeMm: 0,
    });
    if (st.ocean.waves !== false) {
      const { rng } = require('../engine/kit/util');
      const Rw = rng(`${P.S.seed}:gouache:waves`);
      const count = Math.max(8, Math.round((P.w * P.h) / 2600));
      for (let k = 0; k < count; k++) {
        const wx = 6 + Rw() * (P.w - 30);
        const wy = 10 + Rw() * (P.h - 20);
        const wlen = 14 + Rw() * 24;
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          pts.push([wx + t * wlen, wy + Math.sin(t * Math.PI * 2.5) * 1.3]);
        }
        dryBrushStroke(P, pts, k % 3 === 0 ? pal.waterline : pal.waterlineOuter, {
          width: 1.6 + Rw() * 1.4,
          opacity: 0.58,
          dryness: 0.52,
        });
      }
    }
    return;
  }

  if (mode === 'soft-grain') {
    fillSoftGrain(P, [rect], oceanColor, {
      shadeColor: st.ocean.shadeColor || pal.oceanShallow,
      grainAmt: st.ocean.grainAmt ?? 0.20,
    });
    return;
  }

  if (mode === 'watercolor' || mode === 'anno') {
    fillWatercolorMultiply(P, [rect], oceanColor, {
      color2: st.ocean.color2 || pal.oceanShallow,
      strength: st.ocean.strength ?? (mode === 'anno' ? 0.36 : 0.68),
      granulation: st.ocean.granulation ?? (mode === 'anno' ? 0.25 : 0.55),
      backrunAmt: st.ocean.backrunAmt ?? (mode === 'anno' ? 0.14 : 0.40),
      cloudAmt: st.ocean.cloudAmt ?? (mode === 'anno' ? 0.18 : 0.38),
    });
    return;
  }

  if (mode === 'paper-cut') {
    const fullRect = customRect || [[0, 0], [P.w, 0], [P.w, P.h], [0, P.h]];
    cutPaperLayer(P, [fullRect], oceanColor, { elevation: 0, shadowDark: 0, rimLight: 0, rimShade: 0 });
    return;
  }

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
  if (mode === 'none') return;

  const m = MK.maskOf(P.S, polys);
  const r1 = MK.dilate(P.S, m, o.r1 ?? st?.waterlines?.r1 ?? 1.4);
  const r2 = MK.dilate(P.S, m, o.r2 ?? st?.waterlines?.r2 ?? 2.8);

  if (mode === 'paper-shelf') {
    cutPaperLayer(P, [], pal.oceanDeep || '#3f789c', { mask: r2, elevation: 1.25, shadowDark: 0.30, rimLight: 0.22 });
    cutPaperLayer(P, [], o.shallowColor || pal.oceanShallow || '#6da5bf', { mask: r1, elevation: 1.35, shadowDark: 0.30, rimLight: 0.25 });
    return;
  }

  if (mode === 'gouache-halo') {
    fillDryGouache(P, [], o.shallowColor || pal.oceanShallow, { mask: r1, altColor: pal.waterline, opacity: 0.72, dryEdgeMm: 2.0 });
    return;
  }

  if (mode === 'anno-ripple') {
    MK.outline(P.S, P.pen(0.14, pal.waterline), r1, { tremor: 0.45 });
    MK.outline(P.S, P.pen(0.10, pal.waterlineOuter), r2, { dash: 4.5, gap: 3.0, tremor: 0.40 });
    return;
  }

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

  if (borderStyle === 'none') return;
  if (borderStyle === 'blueprint') return drawBlueprintBorder(P, o, pal, pad, inner);
  if (borderStyle === 'celestial') return drawCelestialBorder(P, o, pal, pad, inner);
  if (borderStyle === 'scroll') return drawScrollBorder(P, o, pal, pad, inner);

  if (borderStyle === 'shadow-box') {
    const matW = Math.max(inner, 8.5);
    const matOuter = [[0, 0], [w, 0], [w, h], [0, h]];
    const matHole = [[matW, matW], [w - matW, matW], [w - matW, h - matW], [matW, h - matW]];
    const matMask = MK.maskOf(P.S, [matOuter]);
    MK.subtract(P.S, matMask, [matHole]);
    cutPaperLayer(P, [], pal.paper || '#f4ecdc', { mask: matMask, elevation: 2.6, shadowDark: 0.42, invertShadow: true });
    drawTickLabels(P, o.ticks, matW, pal.tickLabel);
    return;
  }

  if (borderStyle === 'scrapbook' || borderStyle === 'editorial' || borderStyle === 'hairline') {
    const m = borderStyle === 'hairline' ? Math.max(pad, 6.5) : Math.max(pad, 5.5);
    P.paper([
      [[0, 0], [w, 0], [w, m], [0, m]],
      [[0, h - m], [w, h - m], [w, h], [0, h]],
      [[0, 0], [m, 0], [m, h], [0, h]],
      [[w - m, 0], [w, 0], [w, h], [w - m, h]],
    ]);
    if (borderStyle === 'hairline') {
      P.ink([[m, m], [w - m, m], [w - m, h - m], [m, h - m], [m, m]], { nib: 0.22, color: pal.ink });
      P.ink([[m - 1.2, m - 1.2], [w - m + 1.2, m - 1.2], [w - m + 1.2, h - m + 1.2], [m - 1.2, h - m + 1.2], [m - 1.2, m - 1.2]], { nib: 0.11, color: pal.borderAccent || pal.ink });
    } else if (borderStyle === 'scrapbook') {
      P.ink([[m, m], [w - m, m], [w - m, h - m], [m, h - m], [m, m]], { nib: 0.36, color: pal.ink });
    } else {
      P.ink([[m, m], [w - m, m], [w - m, h - m], [m, h - m], [m, m]], { nib: 0.16, color: pal.divider || pal.ink });
    }
    drawTickLabels(P, o.ticks, m, pal.tickLabel);
    return;
  }

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

// Overlapping jagged mountain range chain (style-aware)
function drawMountainRange(P, peaks, o = {}) {
  const st = styleOf(P);
  const pal = palOf(P);
  const mode = o.style || st?.mountains || 'classic';

  if (mode === 'paper-cut') {
    for (const [cx, by, w, h, snow] of peaks) {
      const body = [[cx - w * 1.1, by], [cx, by - h * 1.1], [cx + w * 1.1, by]];
      cutPaperLayer(P, [body], o.color || pal.mountain, { elevation: 1.6, shadowDark: 0.34, rimLight: 0.28 });
      if (snow) {
        const cap = [[cx - w * 0.40, by - h * 0.68], [cx, by - h * 1.1], [cx + w * 0.40, by - h * 0.68], [cx + w * 0.12, by - h * 0.58], [cx - w * 0.14, by - h * 0.64]];
        cutPaperLayer(P, [cap], pal.snow, { elevation: 0.8, shadowDark: 0.22, rimLight: 0.26 });
      }
    }
    return;
  }

  if (mode === 'gouache') {
    for (const [cx, by, w, h, snow] of peaks) {
      fillDryGouache(P, [[[cx - w, by], [cx, by - h], [cx, by]]], o.color || pal.mountain, { opacity: 0.96, dryEdgeMm: 0.7 });
      fillDryGouache(P, [[[cx, by - h], [cx + w, by], [cx, by]]], pal.mountainLight, { opacity: 0.96, dryEdgeMm: 0.7 });
      if (snow) {
        fillDryGouache(P, [[[cx - w * 0.36, by - h * 0.62], [cx, by - h], [cx + w * 0.38, by - h * 0.60], [cx, by - h * 0.48]]], pal.snow, { opacity: 0.98, dryEdgeMm: 0.5 });
      }
    }
    return;
  }

  if (mode === 'geometric') {
    for (const [cx, by, w, h, snow] of peaks) {
      fillSoftGrain(P, [[[cx - w, by], [cx, by - h], [cx, by]]], o.color || pal.mountain, { grainAmt: 0.18 });
      fillSoftGrain(P, [[[cx, by - h], [cx + w, by], [cx, by]]], pal.mountainLight, { grainAmt: 0.18 });
      if (snow) {
        fillSoftGrain(P, [[[cx - w * 0.36, by - h * 0.62], [cx, by - h], [cx + w * 0.36, by - h * 0.62]]], pal.snow, { grainAmt: 0.06 });
      }
    }
    return;
  }

  if (mode === 'collage') {
    for (const [cx, by, w, h, snow] of peaks) {
      const tri = [[cx - w, by], [cx, by - h], [cx + w, by]];
      fillCollage(P, [tri], o.color || pal.mountain, { pattern: 'stripes', patternColor: pal.ink, angle: 55, cutShadow: true });
      if (snow) {
        fillCollage(P, [[[cx - w * 0.36, by - h * 0.64], [cx, by - h], [cx + w * 0.36, by - h * 0.64], [cx, by - h * 0.56]]], pal.snow, { pattern: 'solid' });
      }
      P.outline([tri], { nib: 0.18, color: pal.ink });
    }
    return;
  }

  if (mode === 'anno' || mode === 'watercolor') {
    for (const [cx, by, w, h, snow] of peaks) {
      const mtn = D.curve([[cx - w, by], [cx - w * 0.35, by - h * 0.6], [cx, by - h], [cx + w * 0.4, by - h * 0.55], [cx + w, by]], true, 0.25);
      P.paper([mtn]);
      fillWatercolorMultiply(P, [mtn], o.color || pal.mountainLight, { color2: pal.mountain, strength: mode === 'anno' ? 0.44 : 0.62, backrunAmt: 0.22 });
      P.hatch([mtn], { clip: [[[cx, by - h - 1], [cx + w + 1, by - h - 1], [cx + w + 1, by + 1], [cx, by + 1]]], angle: 55, pitch: 0.48, nib: 0.11, color: pal.shadow || pal.ink });
      P.ink([[cx - w, by], [cx - w * 0.35, by - h * 0.6], [cx, by - h], [cx + w * 0.4, by - h * 0.55], [cx + w, by]], { nib: 0.16, color: pal.ink });
      if (snow) {
        fillWatercolorMultiply(P, [[[cx - w * 0.28, by - h * 0.68], [cx, by - h], [cx + w * 0.28, by - h * 0.66]]], pal.snow, { strength: 0.35 });
      }
    }
    return;
  }

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

function polylineRibbon(pts, halfW) {
  if (!pts || pts.length < 2) return null;
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfW;
    const ny = (dx / len) * halfW;
    left.push([pts[i][0] + nx, pts[i][1] + ny]);
    right.push([pts[i][0] - nx, pts[i][1] - ny]);
  }
  return left.concat(right.reverse());
}

// Winding river (style-aware: ink / dry-brush gouache / cut-paper ribbon)
function drawRiver(P, ctrlPts, o = {}) {
  const st = styleOf(P);
  const pal = palOf(P);
  const col = o.color || pal.river;
  const curvePts = D.curve(ctrlPts, false, 0.35);
  if (st?.fill?.mode === 'gouache') {
    dryBrushStroke(P, curvePts, col, { width: (o.nib ?? 0.42) * 3.2, opacity: 0.90, dryness: 0.24 });
    return;
  }
  if (st?.fill?.mode === 'paper-cut') {
    const ribbon = polylineRibbon(curvePts, Math.max(0.45, (o.nib ?? 0.42) * 1.4));
    if (ribbon) cutPaperLayer(P, [ribbon], col, { elevation: 0.55, shadowDark: 0.22, rimLight: 0.18 });
    return;
  }
  P.ink(curvePts, { nib: o.nib ?? 0.42, color: col, tremor: o.tremor });
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
  } else if (mode === 'stamp') {
    const badge = D.rrect(x, y, x + w, y + h, 1.2);
    fillCollage(P, [badge], pal.cream, { pattern: 'linen', patternColor: pal.divider, cutShadow: true });
    P.outline([badge], { nib: 0.28, color: pal.ink });
    fillCollage(P, [[[x + 1.5, y + 1.5], [x + w - 1.5, y + 1.5], [x + w - 1.5, y + 4.8], [x + 1.5, y + 4.8]]], pal.borderAccent || pal.crimson, { pattern: 'stripes', patternColor: pal.crimson });
  } else if (mode === 'banner') {
    const banner = D.curve([[x, y + 1], [x + w, y], [x + w + 1, y + h], [x - 1, y + h + 1]], true, 0.25);
    fillDryGouache(P, [banner], pal.cream, { altColor: pal.paper, opacity: 0.96, dryEdgeMm: 1.0 });
    fillDryGouache(P, [[[x + 2, y + 1.5], [x + w - 2, y + 1], [x + w - 1.8, y + 5.2], [x + 1.8, y + 5.6]]], pal.borderAccent || pal.crimson, { opacity: 0.95, dryEdgeMm: 0.5 });
  } else if (mode === 'infographic') {
    const card = D.rrect(x, y, x + w, y + h, 1.8);
    fillSoftGrain(P, [card], pal.cream, { shadeColor: pal.divider, grainAmt: 0.16 });
    fillSoftGrain(P, [[[x, y], [x + w, y], [x + w, y + 5.0], [x, y + 5.0]]], pal.ink, { grainAmt: 0.12 });
  } else if (mode === 'minimal' || mode === 'quiet') {
    const box = D.rrect(x, y, x + w, y + h, 1.0);
    P.paper([box]);
    fillWatercolorMultiply(P, [box], pal.cream, { strength: 0.30, backrunAmt: 0.12 });
    P.outline([box], { nib: mode === 'quiet' ? 0.14 : 0.18, color: pal.divider || pal.ink });
  } else if (mode === 'plaque') {
    const box = D.rrect(x, y, x + w, y + h, 1.5);
    cutPaperLayer(P, [box], pal.cream, { elevation: 1.8, shadowDark: 0.36, rimLight: 0.30 });
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

// Structured Editorial Infographic Sidebar (The 50 States layout mode)
function drawInfographicSidebar(P, box, info = {}) {
  const { hexToRgb } = require('../engine/kit/util');
  const pal = palOf(P);
  const st = styleOf(P);
  const { x, y, w, h } = box;
  const regPal = st?.regionPalette || [pal.crimson, pal.navy, pal.ochre, pal.forest, pal.terracotta, pal.slate];

  // Clean paper/grain backdrop behind sidebar
  fillSoftGrain(P, [[[x - 3, 0], [P.w, 0], [P.w, P.h], [x - 3, P.h]]], pal.paper || '#f6efe0', {
    shadeColor: pal.divider || '#e5dac3',
    grainAmt: 0.14,
  });

  // Top editorial banner header across sidebar
  let curY = y;
  if (info.title) {
    const bannerH = info.subtitle ? 18 : 13;
    fillSoftGrain(P, [D.rrect(x, curY, x + w, curY + bannerH, 1.5)], pal.ink, { grainAmt: 0.14 });
    const { text: fittedTitle, size: titleSz } = fitTextToWidth(info.title, 'serif-bold', 5.8, w - 8, 2.2);
    P.text(fittedTitle, x + w / 2, curY + (info.subtitle ? 8.2 : 8.5), {
      face: 'serif-bold',
      size: titleSz,
      align: 'center',
      color: pal.cream || '#fbf6eb',
    });
    if (info.subtitle) {
      const { text: fittedSub, size: subSz } = fitTextToWidth(info.subtitle, 'sans-bold', 2.2, w - 8, 1.4);
      P.text(fittedSub, x + w / 2, curY + 14.2, {
        face: 'sans-bold',
        size: subSz,
        align: 'center',
        color: pal.borderAccent || pal.gold,
      });
    }
    curY += bannerH + 3.5;
  }

  // 2-column stat cards
  const stats = Array.isArray(info.stats) ? info.stats : [];
  if (stats.length) {
    const gap = 2.5;
    const tileW = (w - gap) / 2;
    const tileH = 18;
    stats.slice(0, 4).forEach((s, idx) => {
      const colIdx = idx % 2;
      const rowIdx = Math.floor(idx / 2);
      const tx = x + colIdx * (tileW + gap);
      const ty = curY + rowIdx * (tileH + gap);
      const bg = s.color || regPal[idx % regPal.length];
      fillSoftGrain(P, [D.rrect(tx, ty, tx + tileW, ty + tileH, 1.6)], bg, { grainAmt: 0.22 });
      const bgRgb = hexToRgb(bg);
      const bgLum = (0.299 * bgRgb[0] + 0.587 * bgRgb[1] + 0.114 * bgRgb[2]) / 255;
      const fg = s.textColor || (bgLum > 0.62 ? pal.ink : '#ffffff');
      const { text: fk, size: ks } = fitTextToWidth(String(s.label || s.k || ''), 'sans-bold', 1.9, tileW - 4, 1.3);
      const { text: fv, size: vs } = fitTextToWidth(String(s.value || s.v || ''), 'serif-bold', 3.0, tileW - 4, 1.6);
      P.text(fk, tx + tileW / 2, ty + 6.4, { face: 'sans-bold', size: ks, align: 'center', color: fg });
      P.text(fv, tx + tileW / 2, ty + 13.2, { face: 'serif-bold', size: vs, align: 'center', color: fg });
    });
    const rows = Math.ceil(Math.min(4, stats.length) / 2);
    curY += rows * (tileH + gap) + 2;
  }

  // Numbered Key Facts & Landmarks card
  const items = Array.isArray(info.items) ? info.items : [];
  const cardH = Math.max(24, y + h - curY);
  fillSoftGrain(P, [D.rrect(x, curY, x + w, curY + cardH, 1.8)], pal.cream || '#fbf6eb', {
    shadeColor: pal.divider || '#e8dec8',
    grainAmt: 0.14,
  });
  fillSoftGrain(P, [[[x, curY], [x + w, curY], [x + w, curY + 8.5], [x, curY + 8.5]]], pal.ink, { grainAmt: 0.12 });
  P.text(info.itemsTitle || 'KEY HIGHLIGHTS', x + w / 2, curY + 5.8, {
    face: 'sans-bold',
    size: 2.3,
    align: 'center',
    color: pal.borderAccent || pal.gold,
  });

  if (items.length) {
    const availH = Math.max(12, cardH - 12);
    const step = Math.min(15.5, availH / items.length);
    items.forEach((it, idx) => {
      const ry = curY + 12 + idx * step + step * 0.35;
      if (ry > curY + cardH - 3) return;
      const badgeCol = it.color || regPal[idx % regPal.length];
      const bRgb = hexToRgb(badgeCol);
      const bLum = (0.299 * bRgb[0] + 0.587 * bRgb[1] + 0.114 * bRgb[2]) / 255;
      fillSoftGrain(P, [D.ell(x + 6.5, ry, 3.2, 3.2)], badgeCol, { grainAmt: 0.16 });
      P.text(String(it.num ?? idx + 1), x + 6.5, ry + 0.9, { face: 'sans-bold', size: 2.3, align: 'center', color: bLum > 0.62 ? pal.ink : '#ffffff' });
      const titleTxt = typeof it === 'string' ? it : (it.title || it.name || '');
      const subTxt = typeof it === 'string' ? '' : (it.sub || it.subtitle || '');
      const { text: ft, size: ts } = fitTextToWidth(titleTxt, 'sans-bold', 2.4, w - 15, 1.5);
      P.text(ft, x + 12.2, subTxt ? ry - 0.5 : ry + 0.7, { face: 'sans-bold', size: ts, align: 'left', color: pal.ink });
      if (subTxt) {
        const { text: fs, size: ss } = fitTextToWidth(subTxt, 'sans', 1.95, w - 15, 1.3);
        P.text(fs, x + 12.2, ry + 3.1, { face: 'sans', size: ss, align: 'left', color: pal.tickLabel || pal.callout });
      }
      if (idx < items.length - 1) {
        P.ink([[x + 4, ry + step * 0.52], [x + w - 4, ry + step * 0.52]], { nib: 0.09, color: pal.divider || '#d8ceb8', tremor: 0.05 });
      }
    });
  }
}

// Bare-Paper Flat-Lay Field-Guide Specimen Sidebar (Everything & Everywhere layout mode)
function drawSpecimenSidebar(P, box, info = {}, drawSpecimenFn) {
  const pal = palOf(P);
  const { x, y, w, h } = box;
  // Clean bare watercolor paper strip on right side
  P.paper([[[x - 3, 0], [P.w, 0], [P.w, P.h], [x - 3, P.h]]]);
  const cx = x + w / 2;
  P.text(info.title || 'FIELD SPECIMENS', cx, y + 7, {
    face: 'sans-bold',
    size: 2.7,
    align: 'center',
    color: pal.regionLabel || pal.ink,
    spacing: 0.12,
  });
  P.ink([[x + 4, y + 10.5], [x + w - 4, y + 10.5]], { nib: 0.14, color: pal.divider || pal.ink, tremor: 0.55 });

  const items = Array.isArray(info.specimens) ? info.specimens : (Array.isArray(info.items) ? info.items : []);
  if (!items.length) return;
  const top = y + 16;
  const slotH = (h - 18) / items.length;
  items.forEach((sp, idx) => {
    const sy = top + idx * slotH + slotH * 0.54;
    if (typeof drawSpecimenFn === 'function') {
      drawSpecimenFn(sp, cx, sy, slotH, idx);
    }
    const label = typeof sp === 'string' ? sp : (sp.label || sp.title || sp.type || '');
    if (label) {
      const { text: fl, size: ls } = fitTextToWidth(label, 'serif', 2.35, w - 6, 1.4);
      P.text(fl, cx, top + (idx + 1) * slotH - 3.0, {
        face: 'serif',
        size: ls,
        align: 'center',
        color: pal.callout || pal.ink,
      });
    }
  });
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
  organicBlob,
  fillCollage,
  fillDryGouache,
  dryBrushStroke,
  fillSoftGrain,
  fillWatercolorMultiply,
  cutPaperLayer,
  polylineRibbon,
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
  drawInfographicSidebar,
  drawSpecimenSidebar,
  drawInsetBox,
};
