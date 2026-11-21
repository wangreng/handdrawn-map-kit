'use strict';

const CELL_BORDER = 1;
const CELL_LAND = 2;
const CELL_OCCUPIED = 4;

// Approximate unscaled [dx0, dy0, w, h] footprints (in mm relative to anchor)
// for all 43 built-in elements in src/elements.js.
const ELEMENT_BOUNDS = {
  tree: [-4.8, -11.8, 9.6, 11.8],
  sakura: [-6.3, -11.8, 12.8, 11.8],
  pine: [-4.4, -12.2, 8.8, 12.2],
  bamboo: [-7.4, -17.0, 14.8, 17.0],
  mountain: [-16.0, -12.8, 32.0, 12.8],
  onsen: [-10.6, -14.2, 21.2, 14.9],
  torii: [-9.4, -14.2, 18.8, 14.2],
  pagoda: [-8.6, -22.5, 17.2, 22.5],
  castle: [-12.0, -22.5, 24.0, 22.5],
  tokyoTower: [-5.8, -28.5, 11.6, 28.5],
  house: [-7.6, -11.4, 15.2, 11.4],
  lighthouse: [-7.8, -20.0, 15.6, 20.0],
  shinkansen: [-16.0, -5.2, 33.0, 5.8],
  sailboat: [-9.5, -15.5, 19.0, 15.9],
  whale: [-10.0, -11.4, 24.2, 13.6],
  shibaInu: [-6.8, -12.4, 14.6, 12.4],
  deer: [-7.7, -17.2, 12.7, 17.2],
  crane: [-7.6, -16.9, 14.0, 16.9],
  koi: [-6.5, -2.5, 15.7, 5.0],
  foodBowl: [-8.8, -12.0, 18.4, 12.0],
  sushi: [-6.2, -7.4, 12.4, 7.6],
  onigiri: [-5.4, -9.2, 10.8, 9.3],
  dango: [-5.8, -12.2, 6.9, 14.1],
  matcha: [-6.2, -13.0, 12.4, 13.0],
  daruma: [-5.2, -11.1, 10.4, 11.2],
  koinobori: [-0.9, -22.5, 14.1, 22.5],
  origamiCrane: [-6.6, -5.8, 13.1, 6.3],
  sumoRing: [-13.5, -14.9, 27.0, 16.6],
  palaceGate: [-14.0, -18.2, 28.0, 18.2],
  hillTower: [-10.0, -30.0, 20.0, 30.0],
  hanok: [-10.2, -11.0, 20.4, 11.0],
  onggi: [-9.3, -10.1, 19.1, 10.1],
  bibimbap: [-8.8, -10.0, 17.6, 10.0],
  gimbap: [-8.5, -6.1, 17.0, 6.2],
  dolHareubang: [-4.6, -17.8, 9.2, 17.8],
  mugunghwa: [-7.0, -5.4, 14.0, 10.5],
  turtleShip: [-15.5, -19.5, 28.0, 20.4],
  stoneObservatory: [-5.8, -14.8, 11.6, 14.8],
  tiger: [-7.8, -11.6, 17.5, 11.6],
  crab: [-8.4, -7.9, 16.8, 11.7],
  tangerine: [-5.8, -6.8, 11.6, 6.8],
  hahoeMask: [-4.4, -6.4, 8.8, 12.4],
  hanbok: [-9.6, -42.0, 19.2, 42.3],
};

// Unscaled [dx0, dy0, w, h] footprints for engine/lib/people.js POSES (default scale = 0.52).
const PERSON_POSE_BOUNDS = {
  stand: [-8.4, -38.3, 16.8, 38.6],
  wave: [-8.4, -38.3, 20.6, 38.6],
  cheer: [-12.2, -38.3, 24.4, 38.6],
  hold: [-7.8, -38.3, 15.6, 38.6],
  reach: [-8.4, -38.3, 24.2, 38.6],
  shake: [-7.6, -38.3, 19.4, 38.6],
  roll: [-8.8, -38.3, 17.6, 38.6],
  raise: [-8.4, -38.3, 19.8, 38.6],
  stir: [-7.8, -38.3, 21.0, 38.6],
  dig: [-7.6, -38.3, 16.4, 38.6],
};

const DEFAULT_ELEMENT_BOUNDS = [-8, -12, 16, 12];

function assertFinite(val, label) {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new TypeError(`BBox ${label} must be a finite number (got ${val})`);
  }
}

function normalizeBBox(x, y, w, h) {
  assertFinite(x, 'x');
  assertFinite(y, 'y');
  assertFinite(w, 'w');
  assertFinite(h, 'h');
  const x0 = w >= 0 ? x : x + w;
  const y0 = h >= 0 ? y : y + h;
  const nw = Math.abs(w);
  const nh = Math.abs(h);
  return {
    x: x0,
    y: y0,
    w: nw,
    h: nh,
    x0,
    y0,
    x1: x0 + nw,
    y1: y0 + nh,
  };
}

function bboxFromPoints(pts, pad = 0) {
  if (!Array.isArray(pts) || pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of pts) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const [px, py] = pt;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  if (!Number.isFinite(minX)) return null;
  return normalizeBBox(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
}

function unionBBox(a, b) {
  if (!a) return b ? normalizeBBox(b.x0 ?? b.x, b.y0 ?? b.y, b.w, b.h) : null;
  if (!b) return normalizeBBox(a.x0 ?? a.x, a.y0 ?? a.y, a.w, a.h);
  const x0 = Math.min(a.x0 ?? a.x, b.x0 ?? b.x);
  const y0 = Math.min(a.y0 ?? a.y, b.y0 ?? b.y);
  const x1 = Math.max(a.x1 ?? (a.x + a.w), b.x1 ?? (b.x + b.w));
  const y1 = Math.max(a.y1 ?? (a.y + a.h), b.y1 ?? (b.y + b.h));
  return normalizeBBox(x0, y0, x1 - x0, y1 - y0);
}

function estimateElementBox(type, x, y, scale, opts = {}) {
  if (type === 'person') {
    const s = scale ?? 0.52;
    const poseName = typeof opts.pose === 'string' ? opts.pose : 'stand';
    const base = PERSON_POSE_BOUNDS[poseName] || PERSON_POSE_BOUNDS.stand;
    let dx0 = base[0];
    let dy0 = base[1];
    let dx1 = base[0] + base[2];
    const dy1 = base[1] + base[3];
    if (opts.flip) {
      const old0 = dx0;
      dx0 = -dx1;
      dx1 = -old0;
    }
    if (opts.hair === 'bun') dy0 = Math.min(dy0, -42.0);
    if (opts.hat === 'conical') {
      dx0 = Math.min(dx0, -14.2);
      dx1 = Math.max(dx1, 14.2);
      dy0 = Math.min(dy0, -45.4);
    } else if (opts.hat === 'cap') {
      if (opts.flip) dx0 = Math.min(dx0, -11.2);
      else dx1 = Math.max(dx1, 11.2);
      dy0 = Math.min(dy0, -38.6);
    }
    return normalizeBBox(x + dx0 * s, y + dy0 * s, (dx1 - dx0) * s, (dy1 - dy0) * s);
  }

  const defaultScale = type === 'hanbok' ? 0.52 : 1;
  const s = scale ?? defaultScale;
  const [dx0, dy0, w0, h0] = ELEMENT_BOUNDS[type] || DEFAULT_ELEMENT_BOUNDS;
  const angle = typeof opts.angle === 'number' && Number.isFinite(opts.angle) ? opts.angle : 0;

  if (angle !== 0) {
    const lx0 = dx0 * s;
    const ly0 = dy0 * s;
    const lx1 = (dx0 + w0) * s;
    const ly1 = (dy0 + h0) * s;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const corners = [
      [lx0, ly0],
      [lx1, ly0],
      [lx1, ly1],
      [lx0, ly1],
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [cx, cy] of corners) {
      const rx = cx * ca - cy * sa;
      const ry = cx * sa + cy * ca;
      if (rx < minX) minX = rx;
      if (ry < minY) minY = ry;
      if (rx > maxX) maxX = rx;
      if (ry > maxY) maxY = ry;
    }
    return normalizeBBox(x + minX, y + minY, maxX - minX, maxY - minY);
  }

  return normalizeBBox(x + dx0 * s, y + dy0 * s, w0 * s, h0 * s);
}

function overlaps(a, b, pad = 0) {
  if (!a || !b) return null;
  const rawAx0 = a.x0 ?? a.x;
  const rawAy0 = a.y0 ?? a.y;
  const rawAx1 = a.x1 ?? (rawAx0 + a.w);
  const rawAy1 = a.y1 ?? (rawAy0 + a.h);
  const ax0 = Math.min(rawAx0, rawAx1);
  const ax1 = Math.max(rawAx0, rawAx1);
  const ay0 = Math.min(rawAy0, rawAy1);
  const ay1 = Math.max(rawAy0, rawAy1);

  const rawBx0 = b.x0 ?? b.x;
  const rawBy0 = b.y0 ?? b.y;
  const rawBx1 = b.x1 ?? (rawBx0 + b.w);
  const rawBy1 = b.y1 ?? (rawBy0 + b.h);
  const bx0 = Math.min(rawBx0, rawBx1);
  const bx1 = Math.max(rawBx0, rawBx1);
  const by0 = Math.min(rawBy0, rawBy1);
  const by1 = Math.max(rawBy0, rawBy1);

  const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0) + pad;
  const oy = Math.min(ay1, by1) - Math.max(ay0, by0) + pad;
  if (ox <= 0 || oy <= 0) return null;

  const acx = (ax0 + ax1) / 2;
  const acy = (ay0 + ay1) / 2;
  const bcx = (bx0 + bx1) / 2;
  const bcy = (by0 + by1) / 2;

  let dxMm = 0;
  let dyMm = 0;
  if (ox <= oy) {
    dxMm = bcx >= acx ? ox : -ox;
  } else {
    dyMm = bcy >= acy ? oy : -oy;
  }

  return {
    areaMm2: ox * oy,
    dxMm,
    dyMm,
  };
}

function largestEmptyRect(avail, rows, cols, minRows, minCols) {
  const heights = new Int32Array(cols);
  let best = null;
  let bestArea = 0;

  for (let r = 0; r < rows; r++) {
    const rowOff = r * cols;
    for (let c = 0; c < cols; c++) {
      heights[c] = avail[rowOff + c] ? heights[c] + 1 : 0;
    }

    const stack = [];
    for (let c = 0; c <= cols; c++) {
      const h = c < cols ? heights[c] : 0;
      let start = c;
      while (stack.length > 0 && stack[stack.length - 1][1] > h) {
        const [left, rectH] = stack.pop();
        const rectW = c - left;
        if (rectW >= minCols && rectH >= minRows) {
          const area = rectW * rectH;
          if (area > bestArea) {
            bestArea = area;
            best = {
              c0: left,
              r0: r - rectH + 1,
              rc: rectW,
              rr: rectH,
            };
          }
        }
        start = left;
      }
      if (h > 0 && (stack.length === 0 || stack[stack.length - 1][1] < h)) {
        stack.push([start, h]);
      }
    }
  }
  return best;
}

function classifyCorner(x, y, bw, bh, safeFrame) {
  const [sx0, sy0, sx1, sy1] = safeFrame;
  const sw = Math.max(1e-6, sx1 - sx0);
  const sh = Math.max(1e-6, sy1 - sy0);
  const nx = (x + bw / 2 - sx0) / sw;
  const ny = (y + bh / 2 - sy0) / sh;
  if (nx >= 0.35 && nx <= 0.65 && ny >= 0.35 && ny <= 0.65) {
    return 'center';
  }
  const v = ny < 0.5 ? 'top' : 'bottom';
  const h = nx < 0.5 ? 'left' : 'right';
  return `${v}-${h}`;
}

function createLayout({ w = 300, h = 200, inner = 8.0, gridStep = 2.0, padding = 1.0 } = {}) {
  const step = Math.max(0.25, gridStep);
  const safeInner = Math.max(0, inner);
  const safeFrame = [safeInner, safeInner, w - safeInner, h - safeInner];
  const cols = Math.max(1, Math.ceil(w / step));
  const rows = Math.max(1, Math.ceil(h / step));
  const grid = new Uint8Array(cols * rows);
  const items = [];

  if (safeInner > 0) {
    for (let r = 0; r < rows; r++) {
      const cy = (r + 0.5) * step;
      const outY = cy < safeFrame[1] || cy > safeFrame[3];
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * step;
        if (outY || cx < safeFrame[0] || cx > safeFrame[2]) {
          grid[r * cols + c] |= CELL_BORDER;
        }
      }
    }
  }

  function setLandPolygons(ringsMm) {
    // Clear previous CELL_LAND bits so repeated calls are idempotent.
    for (let i = 0; i < grid.length; i++) {
      grid[i] &= ~CELL_LAND;
    }
    if (!Array.isArray(ringsMm)) return;

    for (const ring of ringsMm) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const pt of ring) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
      if (!Number.isFinite(minY)) continue;

      const r0 = Math.max(0, Math.floor(minY / step));
      const r1 = Math.min(rows - 1, Math.ceil(maxY / step));
      const n = ring.length;

      for (let r = r0; r <= r1; r++) {
        const y = (r + 0.5) * step;
        const xs = [];
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const a = ring[j];
          const b = ring[i];
          if (!a || !b) continue;
          const y1 = a[1];
          const y2 = b[1];
          if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
            const t = (y - y1) / (y2 - y1);
            xs.push(a[0] + t * (b[0] - a[0]));
          }
        }
        if (xs.length < 2) continue;
        xs.sort((u, v) => u - v);
        const rowOff = r * cols;
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const xStart = xs[k];
          const xEnd = xs[k + 1];
          const c0 = Math.max(0, Math.floor(xStart / step));
          const c1 = Math.min(cols - 1, Math.ceil(xEnd / step));
          for (let c = c0; c <= c1; c++) {
            const cx = (c + 0.5) * step;
            if (cx >= xStart && cx <= xEnd) {
              grid[rowOff + c] |= CELL_LAND;
            }
          }
        }
      }
    }
  }

  function markOccupied(box) {
    const c0 = Math.max(0, Math.floor(box.x0 / step));
    const c1 = Math.min(cols - 1, Math.floor((box.x1 - 1e-9) / step));
    const r0 = Math.max(0, Math.floor(box.y0 / step));
    const r1 = Math.min(rows - 1, Math.floor((box.y1 - 1e-9) / step));
    for (let r = r0; r <= r1; r++) {
      const rowOff = r * cols;
      for (let c = c0; c <= c1; c++) {
        grid[rowOff + c] |= CELL_OCCUPIED;
      }
    }
  }

  function register(box) {
    if (!box || typeof box !== 'object') {
      throw new TypeError('register(box) requires a box object');
    }
    const bx = box.x ?? box.x0;
    const by = box.y ?? box.y0;
    const bw = box.w ?? (box.x1 !== undefined && bx !== undefined ? box.x1 - bx : undefined);
    const bh = box.h ?? (box.y1 !== undefined && by !== undefined ? box.y1 - by : undefined);
    const norm = normalizeBBox(bx, by, bw, bh);

    const item = {
      id: box.id || `item-${items.length + 1}`,
      kind: box.kind || 'unknown',
      ...norm,
      priority: box.priority ?? 50,
      fixed: box.fixed ?? true,
      layer: box.layer || 'default',
      meta: box.meta ? { ...box.meta } : {},
    };
    items.push(item);
    if (!item.meta.nonBlocking) {
      markOccupied(item);
    }
    return item;
  }

  function findOverlaps(opts = {}) {
    const pad = opts.pad ?? 0;
    const results = [];
    const severityOrder = { high: 3, medium: 2, low: 1 };

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (a.meta && a.meta.nonBlocking) continue;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (b.meta && b.meta.nonBlocking) continue;

        // Skip linked pairs (e.g., element + its label, city + its label, inset + its child).
        const aOwner = a.meta && a.meta.ownerId;
        const bOwner = b.meta && b.meta.ownerId;
        if (aOwner === b.id || bOwner === a.id) continue;
        if (aOwner && bOwner && aOwner === bOwner) continue;
        if (a.meta && b.meta && a.meta.groupId && a.meta.groupId === b.meta.groupId) continue;

        const ov = overlaps(a, b, pad);
        if (!ov) continue;

        const minArea = Math.min(a.w * a.h, b.w * b.h);
        const ratio = minArea > 0 ? ov.areaMm2 / minArea : 0;
        const majorKind =
          a.kind === 'cartouche' || b.kind === 'cartouche' ||
          a.kind === 'inset' || b.kind === 'inset' ||
          a.kind === 'compass' || b.kind === 'compass';

        let severity = 'low';
        if (
          ov.areaMm2 >= 16 ||
          ratio >= 0.35 ||
          (a.kind === 'label' && b.kind === 'label' && ov.areaMm2 >= 2) ||
          (majorKind && ov.areaMm2 >= 6)
        ) {
          severity = 'high';
        } else if (ov.areaMm2 >= 4 || ratio >= 0.12) {
          severity = 'medium';
        }

        results.push({
          a: a.id,
          b: b.id,
          aKind: a.kind,
          bKind: b.kind,
          areaMm2: ov.areaMm2,
          dxMm: ov.dxMm,
          dyMm: ov.dyMm,
          severity,
        });
      }
    }

    results.sort((u, v) => (severityOrder[v.severity] - severityOrder[u.severity]) || (v.areaMm2 - u.areaMm2));
    return results;
  }

  function findOutOfBounds() {
    const out = [];
    const eps = 1e-6;
    for (const item of items) {
      if (item.meta && item.meta.ignoreBounds) continue;
      const left = Math.max(0, safeFrame[0] - item.x0);
      const top = Math.max(0, safeFrame[1] - item.y0);
      const right = Math.max(0, item.x1 - safeFrame[2]);
      const bottom = Math.max(0, item.y1 - safeFrame[3]);
      if (left > eps || top > eps || right > eps || bottom > eps) {
        out.push({
          id: item.id,
          kind: item.kind,
          overflow: {
            left: +left.toFixed(2),
            top: +top.toFixed(2),
            right: +right.toFixed(2),
            bottom: +bottom.toFixed(2),
          },
        });
      }
    }
    return out;
  }

  function isFree(x, y, bw, bh, { terrain = 'any', pad = 0 } = {}) {
    const x0 = x - pad;
    const y0 = y - pad;
    const x1 = x + bw + pad;
    const y1 = y + bh + pad;
    const eps = 1e-6;
    if (x0 < safeFrame[0] - eps || y0 < safeFrame[1] - eps || x1 > safeFrame[2] + eps || y1 > safeFrame[3] + eps) {
      return false;
    }
    const c0 = Math.max(0, Math.floor(x0 / step));
    const c1 = Math.min(cols - 1, Math.floor((x1 - 1e-9) / step));
    const r0 = Math.max(0, Math.floor(y0 / step));
    const r1 = Math.min(rows - 1, Math.floor((y1 - 1e-9) / step));
    for (let r = r0; r <= r1; r++) {
      const rowOff = r * cols;
      for (let c = c0; c <= c1; c++) {
        const val = grid[rowOff + c];
        if (val & (CELL_BORDER | CELL_OCCUPIED)) return false;
        if (terrain === 'sea' && (val & CELL_LAND)) return false;
        if (terrain === 'land' && !(val & CELL_LAND)) return false;
      }
    }
    return true;
  }

  function findEmptyRegions({ terrain = 'sea', minW = 24, minH = 18, maxCount = 6 } = {}) {
    const avail = new Uint8Array(cols * rows);
    for (let i = 0; i < grid.length; i++) {
      const val = grid[i];
      if (val & (CELL_BORDER | CELL_OCCUPIED)) continue;
      if (terrain === 'sea' && (val & CELL_LAND)) continue;
      if (terrain === 'land' && !(val & CELL_LAND)) continue;
      avail[i] = 1;
    }

    const minCols = Math.max(1, Math.ceil(minW / step));
    const minRows = Math.max(1, Math.ceil(minH / step));
    const regions = [];

    for (let iter = 0; iter < maxCount; iter++) {
      const rect = largestEmptyRect(avail, rows, cols, minRows, minCols);
      if (!rect) break;

      const rx = Math.max(safeFrame[0], rect.c0 * step);
      const ry = Math.max(safeFrame[1], rect.r0 * step);
      const rx1 = Math.min(safeFrame[2], (rect.c0 + rect.rc) * step);
      const ry1 = Math.min(safeFrame[3], (rect.r0 + rect.rr) * step);

      // Mask out these cells so subsequent iterations find disjoint regions.
      for (let r = rect.r0; r < rect.r0 + rect.rr; r++) {
        const rowOff = r * cols;
        for (let c = rect.c0; c < rect.c0 + rect.rc; c++) {
          avail[rowOff + c] = 0;
        }
      }

      // Round inward to 2 decimals so formatted bounds never cross safeFrame or occupied boundaries.
      const x0 = Math.ceil(rx * 100 - 1e-9) / 100;
      const y0 = Math.ceil(ry * 100 - 1e-9) / 100;
      const x1 = Math.floor(rx1 * 100 + 1e-9) / 100;
      const y1 = Math.floor(ry1 * 100 + 1e-9) / 100;
      const rw = +(x1 - x0).toFixed(2);
      const rh = +(y1 - y0).toFixed(2);

      if (rw < minW - 1e-6 || rh < minH - 1e-6) continue;
      if (!isFree(x0, y0, rw, rh, { terrain })) continue;

      regions.push({
        terrain,
        x: x0,
        y: y0,
        w: rw,
        h: rh,
        areaMm2: +(rw * rh).toFixed(2),
        corner: classifyCorner(x0, y0, rw, rh, safeFrame),
      });
    }

    regions.sort((a, b) => b.areaMm2 - a.areaMm2);
    return regions;
  }

  function toDiagnostics({ ppm = 10, warnings = [] } = {}) {
    let interiorCells = 0;
    let landCells = 0;
    let seaCells = 0;
    for (let i = 0; i < grid.length; i++) {
      const val = grid[i];
      if (val & CELL_BORDER) continue;
      interiorCells++;
      if (val & CELL_LAND) landCells++;
      else seaCells++;
    }
    const landCoveragePct = interiorCells > 0 ? +((landCells / interiorCells) * 100).toFixed(1) : 0;
    const seaCoveragePct = interiorCells > 0 ? +((seaCells / interiorCells) * 100).toFixed(1) : 0;

    const overlapList = findOverlaps();
    const oobList = findOutOfBounds();
    const emptyRegions = findEmptyRegions({ terrain: 'sea', minW: 24, minH: 18, maxCount: 6 });

    return {
      schemaVersion: 1,
      canvas: {
        w,
        h,
        ppm,
        safeFrame: [...safeFrame],
      },
      summary: {
        totalItems: items.length,
        overlapCount: overlapList.length,
        outOfBoundsCount: oobList.length,
        landCoveragePct,
        seaCoveragePct,
      },
      items: items.map((it) => ({
        id: it.id,
        kind: it.kind,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        x0: it.x0,
        y0: it.y0,
        x1: it.x1,
        y1: it.y1,
        priority: it.priority,
        fixed: it.fixed,
        layer: it.layer,
      })),
      overlaps: overlapList,
      outOfBounds: oobList,
      emptyRegions,
      warnings: [...warnings],
    };
  }

  return {
    CELL_BORDER,
    CELL_LAND,
    CELL_OCCUPIED,
    w,
    h,
    inner: safeInner,
    gridStep: step,
    padding,
    cols,
    rows,
    safeFrame,
    grid,
    items,
    setLandPolygons,
    register,
    overlaps,
    findOverlaps,
    findOutOfBounds,
    findEmptyRegions,
    isFree,
    toDiagnostics,
  };
}

module.exports = {
  CELL_BORDER,
  CELL_LAND,
  CELL_OCCUPIED,
  ELEMENT_BOUNDS,
  PERSON_POSE_BOUNDS,
  normalizeBBox,
  bboxFromPoints,
  unionBBox,
  estimateElementBox,
  overlaps,
  createLayout,
};
