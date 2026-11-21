'use strict';

const { ELEMENT_BOUNDS: RAW_ELEMENT_BOUNDS } = require('./elements');

const CELL_BORDER = 1;
const CELL_LAND = 2;
const CELL_OCCUPIED = 4;

// Unscaled [dx0, dy0, w, h] footprints (in mm relative to anchor)
// derived from src/elements.js ELEMENT_BOUNDS (single source of truth).
const ELEMENT_BOUNDS = Object.fromEntries(
  Object.entries(RAW_ELEMENT_BOUNDS).map(([name, b]) => [
    name,
    [b.x0, b.y0, +(b.x1 - b.x0).toFixed(4), +(b.y1 - b.y0).toFixed(4)],
  ]),
);

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

  const raw = Object.hasOwn(RAW_ELEMENT_BOUNDS, type) ? RAW_ELEMENT_BOUNDS[type] : null;
  const defaultScale = (raw && raw.defaultScale) || 1;
  const s = scale ?? defaultScale;
  const [dx0, dy0, w0, h0] = Object.hasOwn(ELEMENT_BOUNDS, type)
    ? ELEMENT_BOUNDS[type]
    : DEFAULT_ELEMENT_BOUNDS;
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

  function rebuildGrid() {
    for (let i = 0; i < grid.length; i++) {
      grid[i] &= ~CELL_OCCUPIED;
    }
    for (const item of items) {
      if (item.meta && item.meta.nonBlocking) continue;
      markOccupied(item);
    }
  }

  function isLinked(a, b) {
    const aOwner = a.meta && a.meta.ownerId;
    const bOwner = b.meta && b.meta.ownerId;
    if (aOwner === b.id || bOwner === a.id) return true;
    if (aOwner && bOwner && aOwner === bOwner) return true;
    if (a.meta && b.meta && a.meta.groupId && a.meta.groupId === b.meta.groupId) return true;
    return false;
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
        if (isLinked(a, b)) continue;

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
    if (bw === 0 && bh === 0 && pad === 0) return true;
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

  function exactOverlapArea(x, y, bw, bh, pad = 0, ignoreItem = null, list = items) {
    const cand = { x0: x, y0: y, x1: x + bw, y1: y + bh };
    let total = 0;
    for (const other of list) {
      if (other === ignoreItem) continue;
      if (other.meta && other.meta.nonBlocking) continue;
      if (ignoreItem && isLinked(ignoreItem, other)) continue;
      const ov = overlaps(cand, other, pad);
      if (ov) total += ov.areaMm2;
    }
    return total;
  }

  function inSafeFrame(x, y, bw, bh) {
    const eps = 1e-6;
    return (
      x >= safeFrame[0] - eps &&
      y >= safeFrame[1] - eps &&
      x + bw <= safeFrame[2] + eps &&
      y + bh <= safeFrame[3] + eps
    );
  }

  function anchorInRegion(reg, bw, bh, corner, margin) {
    const maxX = Math.max(reg.x, reg.x + reg.w - bw);
    const maxY = Math.max(reg.y, reg.y + reg.h - bh);
    const mx = Math.min(margin, Math.max(0, reg.w - bw));
    const my = Math.min(margin, Math.max(0, reg.h - bh));

    let ax;
    if (corner && corner.includes('left')) ax = reg.x + mx;
    else if (corner && corner.includes('right')) ax = reg.x + reg.w - bw - mx;
    else ax = reg.x + (reg.w - bw) / 2;

    let ay;
    if (corner && corner.includes('top')) ay = reg.y + my;
    else if (corner && corner.includes('bottom')) ay = reg.y + reg.h - bh - my;
    else ay = reg.y + (reg.h - bh) / 2;

    ax = Math.min(Math.max(ax, reg.x, safeFrame[0]), maxX, Math.max(safeFrame[0], safeFrame[2] - bw));
    ay = Math.min(Math.max(ay, reg.y, safeFrame[1]), maxY, Math.max(safeFrame[1], safeFrame[3] - bh));
    return [ax, ay];
  }

  function terrainMatchRatio(x, y, bw, bh, terrain) {
    if (terrain === 'any') return 1;
    const c0 = Math.max(0, Math.floor(x / step));
    const c1 = Math.min(cols - 1, Math.floor((x + bw - 1e-9) / step));
    const r0 = Math.max(0, Math.floor(y / step));
    const r1 = Math.min(rows - 1, Math.floor((y + bh - 1e-9) / step));
    let total = 0;
    let matched = 0;
    for (let r = r0; r <= r1; r++) {
      const rowOff = r * cols;
      for (let c = c0; c <= c1; c++) {
        const val = grid[rowOff + c];
        total++;
        const isLand = Boolean(val & CELL_LAND);
        if ((terrain === 'sea' && !isLand) || (terrain === 'land' && isLand)) matched++;
      }
    }
    return total > 0 ? matched / total : 1;
  }

  function placeAuto({
    w: bw,
    h: bh,
    terrain = 'sea',
    preferredCorners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    margin = 2.0,
    pad = padding,
    fallbackAny = true,
  } = {}) {
    assertFinite(bw, 'w');
    assertFinite(bh, 'h');
    const safeW = safeFrame[2] - safeFrame[0];
    const safeH = safeFrame[3] - safeFrame[1];
    if (bw > safeW + 1e-6 || bh > safeH + 1e-6) {
      return {
        x: +safeFrame[0].toFixed(2),
        y: +safeFrame[1].toFixed(2),
        terrain: 'any',
        corner: 'top-left',
        placed: false,
      };
    }

    const cornerRank = (c) => {
      const idx = preferredCorners.indexOf(c);
      return idx >= 0 ? idx : preferredCorners.length + 1;
    };

    const terrains = (fallbackAny && terrain !== 'any') ? [terrain, 'any'] : [terrain];

    // Step 1: Try maximal empty regions for each terrain in priority order
    for (const terr of terrains) {
      let regions = findEmptyRegions({
        terrain: terr,
        minW: bw + margin * 2,
        minH: bh + margin * 2,
        maxCount: 8,
      });
      if (!regions.length) {
        regions = findEmptyRegions({ terrain: terr, minW: bw, minH: bh, maxCount: 8 });
      }
      if (!regions.length) continue;

      regions.sort((a, b) => (cornerRank(a.corner) - cornerRank(b.corner)) || (b.areaMm2 - a.areaMm2));

      for (const pTry of [pad, 0]) {
        for (const reg of regions) {
          const tryCorners = [reg.corner];
          if (preferredCorners.length && !tryCorners.includes(preferredCorners[0])) {
            tryCorners.push(preferredCorners[0]);
          }
          for (const crn of tryCorners) {
            for (const mTry of [margin, 0]) {
              const [ax, ay] = anchorInRegion(reg, bw, bh, crn, mTry);
              if (inSafeFrame(ax, ay, bw, bh) && exactOverlapArea(ax, ay, bw, bh, pTry) === 0) {
                return {
                  x: +ax.toFixed(2),
                  y: +ay.toFixed(2),
                  terrain: terr,
                  corner: classifyCorner(ax, ay, bw, bh, safeFrame),
                  placed: true,
                };
              }
            }
          }
        }
      }
    }

    // Step 2: Coarse-to-fine scan across safeFrame (plus explicit corner anchors)
    const maxX = safeFrame[2] - bw;
    const maxY = safeFrame[3] - bh;
    const scanStep = Math.max(step, 2.0);
    const candidates = [];

    for (const mTry of [margin, 0]) {
      const xL = Math.min(maxX, safeFrame[0] + mTry);
      const xR = Math.max(safeFrame[0], maxX - mTry);
      const yT = Math.min(maxY, safeFrame[1] + mTry);
      const yB = Math.max(safeFrame[1], maxY - mTry);
      candidates.push([xL, yT], [xR, yT], [xL, yB], [xR, yB]);
    }

    for (let y = safeFrame[1]; y <= maxY + 1e-6; y += scanStep) {
      const cy = Math.min(y, maxY);
      for (let x = safeFrame[0]; x <= maxX + 1e-6; x += scanStep) {
        const cx = Math.min(x, maxX);
        candidates.push([cx, cy]);
      }
    }

    let bestZero = null;
    let bestZeroScore = Infinity;
    let bestFallback = null;
    let bestFallbackArea = Infinity;

    for (const [cx, cy] of candidates) {
      const ovPad = exactOverlapArea(cx, cy, bw, bh, pad);
      const ovZero = ovPad === 0 ? 0 : exactOverlapArea(cx, cy, bw, bh, 0);
      const corner = classifyCorner(cx, cy, bw, bh, safeFrame);
      const cRank = cornerRank(corner);
      const tRatio = terrainMatchRatio(cx, cy, bw, bh, terrain);

      if (ovZero === 0) {
        // Lower score is better: strongly prefer pad-free, matching terrain, preferred corner
        const score = (ovPad > 0 ? 100 : 0) + (1 - tRatio) * 50 + cRank * 5;
        if (score < bestZeroScore) {
          bestZeroScore = score;
          bestZero = {
            x: +cx.toFixed(2),
            y: +cy.toFixed(2),
            terrain: tRatio >= 0.95 ? terrain : 'any',
            corner,
            placed: true,
          };
        }
      } else if (ovZero < bestFallbackArea) {
        bestFallbackArea = ovZero;
        bestFallback = {
          x: +cx.toFixed(2),
          y: +cy.toFixed(2),
          terrain: 'any',
          corner,
          placed: false,
        };
      }
    }

    if (bestZero) return bestZero;
    if (bestFallback) return bestFallback;

    return {
      x: +safeFrame[0].toFixed(2),
      y: +safeFrame[1].toFixed(2),
      terrain: 'any',
      corner: 'top-left',
      placed: false,
    };
  }

  function avoidOverlaps({
    pad = padding,
    maxRadius = 40,
    stepMm = 1.5,
    respectFixed = true,
  } = {}) {
    const active = items.filter((it) => !(it.meta && it.meta.nonBlocking));
    const fixedItems = [];
    const movable = [];
    active.forEach((it, idx) => {
      if (respectFixed && it.fixed) fixedItems.push(it);
      else movable.push({ item: it, idx });
    });

    // Higher-priority movable items settle first so lower-priority items yield to them.
    movable.sort((a, b) => (b.item.priority - a.item.priority) || (a.idx - b.idx));

    const origPos = new Map();
    for (const { item } of movable) {
      origPos.set(item.id, { x: item.x, y: item.y });
    }

    const settled = [...fixedItems];
    const clampPos = (cx, cy, bw, bh) => {
      const minX = safeFrame[0];
      const maxX = Math.max(minX, safeFrame[2] - bw);
      const minY = safeFrame[1];
      const maxY = Math.max(minY, safeFrame[3] - bh);
      return [
        Math.min(maxX, Math.max(minX, cx)),
        Math.min(maxY, Math.max(minY, cy)),
      ];
    };

    const setItemPos = (item, nx, ny) => {
      item.x = nx;
      item.y = ny;
      item.x0 = nx;
      item.y0 = ny;
      item.x1 = nx + item.w;
      item.y1 = ny + item.h;
    };

    const dirs8 = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      dirs8.push([Math.cos(a), Math.sin(a)]);
    }
    const dirs16 = [];
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      dirs16.push([Math.cos(a), Math.sin(a)]);
    }

    const findBestPosition = (item, ox, oy, searchPad) => {
      const bw = item.w;
      const bh = item.h;

      // Try clamped anchor first (handles pure OOB with no collision)
      const [cx0, cy0] = clampPos(ox, oy, bw, bh);
      if (inSafeFrame(cx0, cy0, bw, bh) && exactOverlapArea(cx0, cy0, bw, bh, searchPad, item, settled) === 0) {
        return { x: cx0, y: cy0, ov: 0 };
      }

      // Phase 1: Radial ring search around (ox, oy)
      const stepR = Math.max(0.5, stepMm);
      for (let r = stepR; r <= maxRadius; r += stepR) {
        const dirs = r <= 12 ? dirs8 : dirs16;
        let ringBest = null;
        let ringDist = Infinity;
        for (const [dx, dy] of dirs) {
          const nx = ox + dx * r;
          const ny = oy + dy * r;
          if (!inSafeFrame(nx, ny, bw, bh)) continue;
          if (exactOverlapArea(nx, ny, bw, bh, searchPad, item, settled) === 0) {
            const d = Math.hypot(nx - ox, ny - oy);
            if (d < ringDist) {
              ringDist = d;
              ringBest = { x: nx, y: ny, ov: 0 };
            }
          }
        }
        if (ringBest) return ringBest;
      }

      // Phase 2: Full safeFrame grid scan for closest zero-overlap spot
      const maxX = safeFrame[2] - bw;
      const maxY = safeFrame[3] - bh;
      if (maxX >= safeFrame[0] && maxY >= safeFrame[1]) {
        const scanStep = Math.max(2.0, step);
        let gridBest = null;
        let gridDist = Infinity;
        for (let gy = safeFrame[1]; gy <= maxY + 1e-6; gy += scanStep) {
          const ny = Math.min(gy, maxY);
          for (let gx = safeFrame[0]; gx <= maxX + 1e-6; gx += scanStep) {
            const nx = Math.min(gx, maxX);
            if (exactOverlapArea(nx, ny, bw, bh, searchPad, item, settled) === 0) {
              const d = Math.hypot(nx - ox, ny - oy);
              if (d < gridDist) {
                gridDist = d;
                gridBest = { x: nx, y: ny, ov: 0 };
              }
            }
          }
        }
        if (gridBest) return gridBest;
      }

      return null;
    };

    for (const { item } of movable) {
      const orig = origPos.get(item.id);
      const currentlyFree =
        inSafeFrame(item.x, item.y, item.w, item.h) &&
        exactOverlapArea(item.x, item.y, item.w, item.h, pad, item, settled) === 0;

      if (!currentlyFree) {
        let found = findBestPosition(item, orig.x, orig.y, pad);
        if (!found && pad > 0) {
          found = findBestPosition(item, orig.x, orig.y, 0);
        }
        if (!found) {
          // Last resort: minimum overlap position inside safeFrame
          const [cx0, cy0] = clampPos(orig.x, orig.y, item.w, item.h);
          let bestX = cx0;
          let bestY = cy0;
          let bestOv = exactOverlapArea(cx0, cy0, item.w, item.h, 0, item, settled);
          const maxX = Math.max(safeFrame[0], safeFrame[2] - item.w);
          const maxY = Math.max(safeFrame[1], safeFrame[3] - item.h);
          const scanStep = Math.max(3.0, step * 1.5);
          for (let gy = safeFrame[1]; gy <= maxY + 1e-6; gy += scanStep) {
            const ny = Math.min(gy, maxY);
            for (let gx = safeFrame[0]; gx <= maxX + 1e-6; gx += scanStep) {
              const nx = Math.min(gx, maxX);
              const ov = exactOverlapArea(nx, ny, item.w, item.h, 0, item, settled);
              if (ov < bestOv) {
                bestOv = ov;
                bestX = nx;
                bestY = ny;
              }
            }
          }
          found = { x: bestX, y: bestY, ov: bestOv };
        }
        setItemPos(item, +found.x.toFixed(3), +found.y.toFixed(3));
      }
      settled.push(item);
    }

    rebuildGrid();

    const moved = [];
    for (const { item } of movable) {
      const orig = origPos.get(item.id);
      const dx = item.x - orig.x;
      const dy = item.y - orig.y;
      if (Math.hypot(dx, dy) > 1e-4) {
        moved.push({
          id: item.id,
          dx: +dx.toFixed(3),
          dy: +dy.toFixed(3),
          from: [orig.x, orig.y],
          to: [item.x, item.y],
        });
      }
    }

    return {
      moved,
      unresolved: findOverlaps({ pad: 0 }),
    };
  }

  function routeCallout(fromPt, toBoxOrPt) {
    const from = [fromPt[0], fromPt[1]];
    let to;
    if (Array.isArray(toBoxOrPt)) {
      to = [toBoxOrPt[0], toBoxOrPt[1]];
    } else if (toBoxOrPt && typeof toBoxOrPt === 'object') {
      const bx0 = toBoxOrPt.x0 ?? toBoxOrPt.x;
      const by0 = toBoxOrPt.y0 ?? toBoxOrPt.y;
      const bx1 = toBoxOrPt.x1 ?? (bx0 + toBoxOrPt.w);
      const by1 = toBoxOrPt.y1 ?? (by0 + toBoxOrPt.h);
      const edgePts = [
        [(bx0 + bx1) / 2, by0],
        [(bx0 + bx1) / 2, by1],
        [bx0, (by0 + by1) / 2],
        [bx1, (by0 + by1) / 2],
      ];
      let best = edgePts[0];
      let bestD = Infinity;
      for (const ep of edgePts) {
        const d = Math.hypot(ep[0] - from[0], ep[1] - from[1]);
        if (d < bestD) {
          bestD = d;
          best = ep;
        }
      }
      to = best;
    } else {
      to = [from[0], from[1]];
    }

    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dist = Math.hypot(dx, dy);
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    if (dist < 1e-3) {
      return { from, to, bendX: mx, bendY: my };
    }

    const nx = -dy / dist;
    const ny = dx / dist;
    const maxBend = Math.min(28, dist * 0.55);
    const mags = [0, Math.min(8, maxBend), -Math.min(8, maxBend), Math.min(16, maxBend), -Math.min(16, maxBend), maxBend, -maxBend];
    const bends = mags.map((m) => [mx + nx * m, my + ny * m]);

    const scoreBend = (bx, by) => {
      let hits = 0;
      for (let k = 1; k <= 7; k++) {
        const t = k / 8;
        const u = 1 - t;
        const px = u * u * from[0] + 2 * u * t * bx + t * t * to[0];
        const py = u * u * from[1] + 2 * u * t * by + t * t * to[1];
        const c = Math.floor(px / step);
        const r = Math.floor(py / step);
        if (c >= 0 && c < cols && r >= 0 && r < rows) {
          if (grid[r * cols + c] & CELL_OCCUPIED) hits++;
        }
      }
      return hits;
    };

    let bestBend = bends[0];
    let bestHits = Infinity;
    for (const b of bends) {
      const hits = scoreBend(b[0], b[1]);
      if (hits < bestHits) {
        bestHits = hits;
        bestBend = b;
      }
    }

    return {
      from,
      to,
      bendX: +bestBend[0].toFixed(2),
      bendY: +bestBend[1].toFixed(2),
    };
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
    rebuildGrid,
    register,
    overlaps,
    findOverlaps,
    findOutOfBounds,
    findEmptyRegions,
    isFree,
    placeAuto,
    avoidOverlaps,
    resolveOverlaps: avoidOverlaps,
    routeCallout,
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
