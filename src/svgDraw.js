'use strict';
const { PALETTE, part, wash } = require('./mapPrimitives');

const IDENT = [1, 0, 0, 1, 0, 0];

const CSS_COLORS = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  teal: '#008080',
  navy: '#000080',
  purple: '#800080',
  orange: '#ffa500',
  orangered: '#ff4500',
  gold: '#ffd700',
  goldenrod: '#daa520',
  brown: '#a52a2a',
  saddlebrown: '#8b4513',
  sienna: '#a0522d',
  peru: '#cd853f',
  tan: '#d2b48c',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  linen: '#faf0e6',
  wheat: '#f5deb3',
  khaki: '#f0e68c',
  pink: '#ffc0cb',
  lightpink: '#ffb6c1',
  hotpink: '#ff69b4',
  salmon: '#fa8072',
  coral: '#ff7f50',
  tomato: '#ff6347',
  crimson: '#dc143c',
  firebrick: '#b22222',
  darkred: '#8b0000',
  darkgreen: '#006400',
  forestgreen: '#228b22',
  seagreen: '#2e8b57',
  mediumseagreen: '#3cb371',
  lightgreen: '#90ee90',
  palegreen: '#98fb98',
  yellowgreen: '#9acd32',
  olivedrab: '#6b8e23',
  darkolivegreen: '#556b2f',
  darkblue: '#00008b',
  mediumblue: '#0000cd',
  royalblue: '#4169e1',
  steelblue: '#4682b4',
  dodgerblue: '#1e90ff',
  deepskyblue: '#00bfff',
  skyblue: '#87ceeb',
  lightskyblue: '#87cefa',
  lightblue: '#add8e6',
  powderblue: '#b0e0e6',
  cadetblue: '#5f9ea0',
  turquoise: '#40e0d0',
  indigo: '#4b0082',
  violet: '#ee82ee',
  plum: '#dda0dd',
  orchid: '#da70d6',
  lavender: '#e6e6fa',
  slategray: '#708090',
  slategrey: '#708090',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  dimgray: '#696969',
  dimgrey: '#696969',
  snow: '#fffafa',
  chocolate: '#d2691e',
  sandybrown: '#f4a460',
  burlywood: '#deb887',
  moccasin: '#ffe4b5',
  peachpuff: '#ffdab9',
  mistyrose: '#ffe4e1',
  azure: '#f0ffff',
  aliceblue: '#f0f8ff',
  mintcream: '#f5fffa',
  honeydew: '#f0fff0',
};

// --- 2D Affine Matrix Helpers [a, b, c, d, e, f] ---
function matMul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function matApply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function matScale(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

function parseNums(str) {
  if (!str) return [];
  const out = [];
  const re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const v = parseFloat(m[0]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function parseTransform(str) {
  if (!str || typeof str !== 'string') return IDENT;
  let cur = IDENT;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const fn = m[1];
    const args = parseNums(m[2]);
    let t = IDENT;
    if (fn === 'translate') {
      const tx = args[0] || 0;
      const ty = args[1] || 0;
      t = [1, 0, 0, 1, tx, ty];
    } else if (fn === 'scale') {
      const sx = args.length > 0 ? args[0] : 1;
      const sy = args.length > 1 ? args[1] : sx;
      t = [sx, 0, 0, sy, 0, 0];
    } else if (fn === 'rotate') {
      const deg = args[0] || 0;
      const rad = (deg * Math.PI) / 180;
      const cs = Math.cos(rad);
      const sn = Math.sin(rad);
      if (args.length >= 3) {
        const cx = args[1];
        const cy = args[2];
        t = matMul(matMul([1, 0, 0, 1, cx, cy], [cs, sn, -sn, cs, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
      } else {
        t = [cs, sn, -sn, cs, 0, 0];
      }
    } else if (fn === 'skewX') {
      const rad = ((args[0] || 0) * Math.PI) / 180;
      t = [1, 0, Math.tan(rad), 1, 0, 0];
    } else if (fn === 'skewY') {
      const rad = ((args[0] || 0) * Math.PI) / 180;
      t = [1, Math.tan(rad), 0, 1, 0, 0];
    } else if (fn === 'matrix' && args.length >= 6) {
      t = [args[0], args[1], args[2], args[3], args[4], args[5]];
    }
    cur = matMul(cur, t);
  }
  return cur;
}

// --- Color Resolution ---
function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex2(n) {
  return clampByte(n).toString(16).padStart(2, '0');
}

function resolveColor(val, customPalette, fallbackColor) {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'none' || lower === 'transparent') return null;
  if (lower === 'currentcolor') {
    return fallbackColor ? resolveColor(fallbackColor, customPalette) : { hex: PALETTE.ink, alpha: 1 };
  }
  if (customPalette && typeof customPalette[s] === 'string') {
    return resolveColor(customPalette[s], null, fallbackColor);
  }
  if (customPalette && typeof customPalette[lower] === 'string') {
    return resolveColor(customPalette[lower], null, fallbackColor);
  }
  if (s[0] === '#') {
    const h = s.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      return { hex: '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2], alpha: 1 };
    }
    if (/^[0-9a-fA-F]{4}$/.test(h)) {
      const a = parseInt(h[3] + h[3], 16) / 255;
      return { hex: '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2], alpha: a };
    }
    if (/^[0-9a-fA-F]{6}$/.test(h)) {
      return { hex: '#' + h.toLowerCase(), alpha: 1 };
    }
    if (/^[0-9a-fA-F]{8}$/.test(h)) {
      const a = parseInt(h.slice(6, 8), 16) / 255;
      return { hex: '#' + h.slice(0, 6).toLowerCase(), alpha: a };
    }
    return null;
  }
  const rgbMatch = /^rgba?\(\s*([^)]+)\s*\)$/i.exec(s);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const ch = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)));
      if (ch.every(Number.isFinite)) {
        let alpha = 1;
        if (parts.length >= 4) {
          const a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
          if (Number.isFinite(a)) alpha = Math.max(0, Math.min(1, a));
        }
        return { hex: '#' + toHex2(ch[0]) + toHex2(ch[1]) + toHex2(ch[2]), alpha };
      }
    }
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(PALETTE, s)) {
    return { hex: PALETTE[s], alpha: 1 };
  }
  if (Object.prototype.hasOwnProperty.call(CSS_COLORS, lower)) {
    return { hex: CSS_COLORS[lower], alpha: 1 };
  }
  if (Object.prototype.hasOwnProperty.call(PALETTE, lower)) {
    return { hex: PALETTE[lower], alpha: 1 };
  }
  return null;
}

// --- Curve & Arc Flattening ---
function flattenCubic(x0, y0, x1, y1, x2, y2, x3, y3, tol, out, depth = 0) {
  const dx = x3 - x0;
  const dy = y3 - y0;
  const d2 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
  const d3 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
  const lenSq = dx * dx + dy * dy;
  if (depth >= 12 || (d2 + d3) * (d2 + d3) <= tol * tol * (lenSq || 1)) {
    out.push([x3, y3]);
    return;
  }
  const x01 = (x0 + x1) * 0.5;
  const y01 = (y0 + y1) * 0.5;
  const x12 = (x1 + x2) * 0.5;
  const y12 = (y1 + y2) * 0.5;
  const x23 = (x2 + x3) * 0.5;
  const y23 = (y2 + y3) * 0.5;
  const x012 = (x01 + x12) * 0.5;
  const y012 = (y01 + y12) * 0.5;
  const x123 = (x12 + x23) * 0.5;
  const y123 = (y12 + y23) * 0.5;
  const x0123 = (x012 + x123) * 0.5;
  const y0123 = (y012 + y123) * 0.5;
  flattenCubic(x0, y0, x01, y01, x012, y012, x0123, y0123, tol, out, depth + 1);
  flattenCubic(x0123, y0123, x123, y123, x23, y23, x3, y3, tol, out, depth + 1);
}

function flattenQuad(x0, y0, x1, y1, x2, y2, tol, out, depth = 0) {
  const mx = (x0 + 2 * x1 + x2) * 0.25;
  const my = (y0 + 2 * y1 + y2) * 0.25;
  const lx = (x0 + x2) * 0.5;
  const ly = (y0 + y2) * 0.5;
  const distSq = (mx - lx) * (mx - lx) + (my - ly) * (my - ly);
  if (depth >= 12 || distSq <= tol * tol) {
    out.push([x2, y2]);
    return;
  }
  const x01 = (x0 + x1) * 0.5;
  const y01 = (y0 + y1) * 0.5;
  const x12 = (x1 + x2) * 0.5;
  const y12 = (y1 + y2) * 0.5;
  const x012 = (x01 + x12) * 0.5;
  const y012 = (y01 + y12) * 0.5;
  flattenQuad(x0, y0, x01, y01, x012, y012, tol, out, depth + 1);
  flattenQuad(x012, y012, x12, y12, x2, y2, tol, out, depth + 1);
}

function vecAngle(ux, uy, vx, vy) {
  const dot = ux * vx + uy * vy;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (len === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / len));
  const ang = Math.acos(cos);
  return ux * vy - uy * vx < 0 ? -ang : ang;
}

// W3C SVG 1.1 Appendix F.6.5 & F.6.6 elliptical arc parameterization
function flattenArc(x1, y1, rxIn, ryIn, xAxisRotDeg, largeArcFlag, sweepFlag, x2, y2, tol, out) {
  if (x1 === x2 && y1 === y2) return;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    out.push([x2, y2]);
    return;
  }
  const phi = (xAxisRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) * 0.5;
  const dy2 = (y1 - y2) * 0.5;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  // F.6.6.3: Ensure radii are large enough
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  // F.6.5.2: Compute center in primed coordinates
  const denom = rxSq * y1pSq + rySq * x1pSq;
  const num = Math.max(0, rxSq * rySq - denom);
  const coef = (largeArcFlag === sweepFlag ? -1 : 1) * Math.sqrt(denom > 0 ? num / denom : 0);
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;

  // F.6.5.3: Center in original coordinates
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) * 0.5;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) * 0.5;

  // F.6.5.5 & F.6.5.6: Angles
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const theta1 = vecAngle(1, 0, ux, uy);
  let dTheta = vecAngle(ux, uy, vx, vy);
  if (!sweepFlag && dTheta > 0) dTheta -= Math.PI * 2;
  else if (sweepFlag && dTheta < 0) dTheta += Math.PI * 2;

  const maxR = Math.max(rx, ry);
  const stepAngle = maxR > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / maxR)) : Math.PI / 6;
  const steps = Math.max(2, Math.min(256, Math.ceil(Math.abs(dTheta) / Math.max(0.05, stepAngle))));

  for (let i = 1; i <= steps; i++) {
    const t = theta1 + (dTheta * i) / steps;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const px = cosPhi * rx * ct - sinPhi * ry * st + cx;
    const py = sinPhi * rx * ct + cosPhi * ry * st + cy;
    out.push([px, py]);
  }
}

// --- SVG <path d> Cursor Parser ---
const CMD_RE = /^[MmLlHhVvCcSsQqTtAaZz]$/;

function parsePathD(d, opts = {}) {
  if (!d || typeof d !== 'string') return [];
  const tol = Math.max(0.02, opts.flatness ?? 0.25);
  const len = d.length;
  let pos = 0;

  function skipSep() {
    while (pos < len) {
      const c = d.charCodeAt(pos);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 44) pos++;
      else break;
    }
  }

  function hasMoreNumbers() {
    skipSep();
    if (pos >= len) return false;
    const c = d[pos];
    return (c >= '0' && c <= '9') || c === '+' || c === '-' || c === '.';
  }

  function readNumber() {
    skipSep();
    if (pos >= len) return null;
    const start = pos;
    if (d[pos] === '+' || d[pos] === '-') pos++;
    let hasDigits = false;
    while (pos < len && d[pos] >= '0' && d[pos] <= '9') {
      hasDigits = true;
      pos++;
    }
    if (pos < len && d[pos] === '.') {
      pos++;
      while (pos < len && d[pos] >= '0' && d[pos] <= '9') {
        hasDigits = true;
        pos++;
      }
    }
    if (!hasDigits) {
      pos = start;
      return null;
    }
    if (pos < len && (d[pos] === 'e' || d[pos] === 'E')) {
      const expPos = pos;
      pos++;
      if (pos < len && (d[pos] === '+' || d[pos] === '-')) pos++;
      let expDigits = false;
      while (pos < len && d[pos] >= '0' && d[pos] <= '9') {
        expDigits = true;
        pos++;
      }
      if (!expDigits) pos = expPos;
    }
    const v = parseFloat(d.slice(start, pos));
    return Number.isFinite(v) ? v : null;
  }

  function readFlag() {
    skipSep();
    if (pos >= len) return null;
    const c = d[pos];
    if (c === '0' || c === '1') {
      pos++;
      return c === '1' ? 1 : 0;
    }
    return null;
  }

  const subpaths = [];
  let curPts = null;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCmd = '';
  let lastCubicX = 0;
  let lastCubicY = 0;
  let lastQuadX = 0;
  let lastQuadY = 0;

  function flush(closed) {
    if (curPts && curPts.length > 0) {
      subpaths.push({ pts: curPts, closed });
    }
    curPts = null;
  }

  function ensureSubpath() {
    if (!curPts) {
      curPts = [[cx, cy]];
      sx = cx;
      sy = cy;
    }
  }

  while (pos < len) {
    skipSep();
    if (pos >= len) break;

    let cmd;
    if (CMD_RE.test(d[pos])) {
      cmd = d[pos++];
    } else if (lastCmd) {
      cmd = lastCmd === 'M' ? 'L' : lastCmd === 'm' ? 'l' : lastCmd;
    } else {
      break;
    }

    if (cmd === 'Z' || cmd === 'z') {
      if (curPts) {
        flush(true);
      }
      cx = sx;
      cy = sy;
      lastCmd = cmd;
      continue;
    }

    let firstPair = true;
    while (firstPair || hasMoreNumbers()) {
      const activeCmd = firstPair ? cmd : cmd === 'M' ? 'L' : cmd === 'm' ? 'l' : cmd;
      firstPair = false;

      switch (activeCmd) {
        case 'M':
        case 'm': {
          const x = readNumber();
          const y = readNumber();
          if (x === null || y === null) {
            pos = len;
            break;
          }
          flush(false);
          if (activeCmd === 'm') {
            cx += x;
            cy += y;
          } else {
            cx = x;
            cy = y;
          }
          sx = cx;
          sy = cy;
          curPts = [[cx, cy]];
          lastCmd = activeCmd;
          break;
        }
        case 'L':
        case 'l': {
          const x = readNumber();
          const y = readNumber();
          if (x === null || y === null) {
            pos = len;
            break;
          }
          ensureSubpath();
          cx = activeCmd === 'l' ? cx + x : x;
          cy = activeCmd === 'l' ? cy + y : y;
          curPts.push([cx, cy]);
          lastCmd = activeCmd;
          break;
        }
        case 'H':
        case 'h': {
          const x = readNumber();
          if (x === null) {
            pos = len;
            break;
          }
          ensureSubpath();
          cx = activeCmd === 'h' ? cx + x : x;
          curPts.push([cx, cy]);
          lastCmd = activeCmd;
          break;
        }
        case 'V':
        case 'v': {
          const y = readNumber();
          if (y === null) {
            pos = len;
            break;
          }
          ensureSubpath();
          cy = activeCmd === 'v' ? cy + y : y;
          curPts.push([cx, cy]);
          lastCmd = activeCmd;
          break;
        }
        case 'C':
        case 'c': {
          const x1 = readNumber();
          const y1 = readNumber();
          const x2 = readNumber();
          const y2 = readNumber();
          const x = readNumber();
          const y = readNumber();
          if (x1 === null || y1 === null || x2 === null || y2 === null || x === null || y === null) {
            pos = len;
            break;
          }
          ensureSubpath();
          const ax1 = activeCmd === 'c' ? cx + x1 : x1;
          const ay1 = activeCmd === 'c' ? cy + y1 : y1;
          const ax2 = activeCmd === 'c' ? cx + x2 : x2;
          const ay2 = activeCmd === 'c' ? cy + y2 : y2;
          const ax = activeCmd === 'c' ? cx + x : x;
          const ay = activeCmd === 'c' ? cy + y : y;
          flattenCubic(cx, cy, ax1, ay1, ax2, ay2, ax, ay, tol, curPts);
          lastCubicX = ax2;
          lastCubicY = ay2;
          cx = ax;
          cy = ay;
          lastCmd = activeCmd;
          break;
        }
        case 'S':
        case 's': {
          const x2 = readNumber();
          const y2 = readNumber();
          const x = readNumber();
          const y = readNumber();
          if (x2 === null || y2 === null || x === null || y === null) {
            pos = len;
            break;
          }
          ensureSubpath();
          const isCubicPrev = lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's';
          const ax1 = isCubicPrev ? 2 * cx - lastCubicX : cx;
          const ay1 = isCubicPrev ? 2 * cy - lastCubicY : cy;
          const ax2 = activeCmd === 's' ? cx + x2 : x2;
          const ay2 = activeCmd === 's' ? cy + y2 : y2;
          const ax = activeCmd === 's' ? cx + x : x;
          const ay = activeCmd === 's' ? cy + y : y;
          flattenCubic(cx, cy, ax1, ay1, ax2, ay2, ax, ay, tol, curPts);
          lastCubicX = ax2;
          lastCubicY = ay2;
          cx = ax;
          cy = ay;
          lastCmd = activeCmd;
          break;
        }
        case 'Q':
        case 'q': {
          const x1 = readNumber();
          const y1 = readNumber();
          const x = readNumber();
          const y = readNumber();
          if (x1 === null || y1 === null || x === null || y === null) {
            pos = len;
            break;
          }
          ensureSubpath();
          const ax1 = activeCmd === 'q' ? cx + x1 : x1;
          const ay1 = activeCmd === 'q' ? cy + y1 : y1;
          const ax = activeCmd === 'q' ? cx + x : x;
          const ay = activeCmd === 'q' ? cy + y : y;
          flattenQuad(cx, cy, ax1, ay1, ax, ay, tol, curPts);
          lastQuadX = ax1;
          lastQuadY = ay1;
          cx = ax;
          cy = ay;
          lastCmd = activeCmd;
          break;
        }
        case 'T':
        case 't': {
          const x = readNumber();
          const y = readNumber();
          if (x === null || y === null) {
            pos = len;
            break;
          }
          ensureSubpath();
          const isQuadPrev = lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't';
          const ax1 = isQuadPrev ? 2 * cx - lastQuadX : cx;
          const ay1 = isQuadPrev ? 2 * cy - lastQuadY : cy;
          const ax = activeCmd === 't' ? cx + x : x;
          const ay = activeCmd === 't' ? cy + y : y;
          flattenQuad(cx, cy, ax1, ay1, ax, ay, tol, curPts);
          lastQuadX = ax1;
          lastQuadY = ay1;
          cx = ax;
          cy = ay;
          lastCmd = activeCmd;
          break;
        }
        case 'A':
        case 'a': {
          const rx = readNumber();
          const ry = readNumber();
          const rot = readNumber();
          const largeArc = readFlag();
          const sweep = readFlag();
          const x = readNumber();
          const y = readNumber();
          if (
            rx === null ||
            ry === null ||
            rot === null ||
            largeArc === null ||
            sweep === null ||
            x === null ||
            y === null
          ) {
            pos = len;
            break;
          }
          ensureSubpath();
          const ax = activeCmd === 'a' ? cx + x : x;
          const ay = activeCmd === 'a' ? cy + y : y;
          flattenArc(cx, cy, rx, ry, rot, largeArc, sweep, ax, ay, tol, curPts);
          cx = ax;
          cy = ay;
          lastCmd = activeCmd;
          break;
        }
        default: {
          pos = len;
          break;
        }
      }
      if (pos >= len) break;
    }
  }
  flush(false);
  return subpaths;
}

// --- Shape Geometry Builders ---
function ellipseSubpath(cx, cy, rx, ry) {
  if (!(rx > 0 && ry > 0)) return [];
  const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.max(16, Math.min(96, Math.ceil(perim / 0.8)));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return [{ pts, closed: true }];
}

function rectSubpath(x, y, w, h, rxIn, ryIn) {
  if (!(w > 0 && h > 0)) return [];
  let rx = rxIn;
  let ry = ryIn;
  if (rx != null && ry == null) ry = rx;
  else if (ry != null && rx == null) rx = ry;
  rx = Math.min(w / 2, Math.max(0, rx || 0));
  ry = Math.min(h / 2, Math.max(0, ry || 0));

  if (rx === 0 && ry === 0) {
    return [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
  }
  const n = Math.max(4, Math.min(16, Math.ceil((Math.PI * Math.max(rx, ry)) / 1.5)));
  const pts = [];
  const corners = [
    [x + w - rx, y + ry, -Math.PI / 2, 0],
    [x + w - rx, y + h - ry, 0, Math.PI / 2],
    [x + rx, y + h - ry, Math.PI / 2, Math.PI],
    [x + rx, y + ry, Math.PI, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
  }
  return [{ pts, closed: true }];
}

function polySubpath(pointsStr, closed) {
  const nums = parseNums(pointsStr);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push([nums[i], nums[i + 1]]);
  }
  if (pts.length < 2) return [];
  return [{ pts, closed }];
}

// --- Lightweight Zero-Dep SVG XML Parser ---
function parseAttrs(attrStr) {
  const attrs = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function parseInlineStyle(styleStr) {
  const out = {};
  if (!styleStr) return out;
  for (const partStr of styleStr.split(';')) {
    const idx = partStr.indexOf(':');
    if (idx === -1) continue;
    const k = partStr.slice(0, idx).trim().toLowerCase();
    const v = partStr.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function parseLength(v) {
  if (v == null) return null;
  const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(String(v).trim());
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseDashArray(v) {
  if (!v || v === 'none') return null;
  const nums = parseNums(String(v));
  if (!nums.length) return null;
  if (nums.some((n) => n < 0)) return null;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  if (sum <= 0) return null;
  return nums;
}

function mergeState(parent, attrs) {
  const style = parseInlineStyle(attrs.style);
  const get = (k) => (style[k] !== undefined ? style[k] : attrs[k]);

  const opacityRaw = get('opacity');
  const opacityVal = opacityRaw != null ? parseLength(opacityRaw) : null;
  const fillOpRaw = get('fill-opacity');
  const fillOpVal = fillOpRaw != null ? parseLength(fillOpRaw) : null;
  const strokeOpRaw = get('stroke-opacity');
  const strokeOpVal = strokeOpRaw != null ? parseLength(strokeOpRaw) : null;
  const swRaw = get('stroke-width');
  const swVal = swRaw != null ? parseLength(swRaw) : null;
  const dashRaw = get('stroke-dasharray');
  const dashOffRaw = get('stroke-dashoffset');
  const dashOffVal = dashOffRaw != null ? parseLength(dashOffRaw) : null;

  const transform = attrs.transform ? matMul(parent.transform, parseTransform(attrs.transform)) : parent.transform;

  return {
    transform,
    fill: get('fill') !== undefined ? get('fill') : parent.fill,
    stroke: get('stroke') !== undefined ? get('stroke') : parent.stroke,
    strokeWidth: swVal != null && swVal >= 0 ? swVal : parent.strokeWidth,
    strokeDasharray: dashRaw !== undefined ? parseDashArray(dashRaw) : parent.strokeDasharray,
    strokeDashoffset: dashOffVal != null ? dashOffVal : parent.strokeDashoffset,
    opacity: opacityVal != null ? parent.opacity * Math.max(0, Math.min(1, opacityVal)) : parent.opacity,
    fillOpacity: fillOpVal != null ? Math.max(0, Math.min(1, fillOpVal)) : parent.fillOpacity,
    strokeOpacity: strokeOpVal != null ? Math.max(0, Math.min(1, strokeOpVal)) : parent.strokeOpacity,
    fillRule: get('fill-rule') !== undefined ? get('fill-rule') : parent.fillRule,
    display: get('display') !== undefined ? get('display') : parent.display,
    visibility: get('visibility') !== undefined ? get('visibility') : parent.visibility,
  };
}

const SKIP_CONTAINERS = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'clippath', 'mask', 'pattern', 'lineargradient', 'radialgradient', 'filter', 'symbol']);

function parseSvg(svgString) {
  if (!svgString || typeof svgString !== 'string') {
    return { viewBox: null, width: null, height: null, shapes: [] };
  }

  // Strip comments, XML prolog, DOCTYPE
  const cleaned = svgString
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  const rootState = {
    transform: IDENT,
    fill: '#000000',
    stroke: 'none',
    strokeWidth: 1,
    strokeDasharray: null,
    strokeDashoffset: 0,
    opacity: 1,
    fillOpacity: 1,
    strokeOpacity: 1,
    fillRule: 'nonzero',
    display: '',
    visibility: 'visible',
  };

  let viewBox = null;
  let width = null;
  let height = null;
  const shapes = [];
  const stateStack = [rootState];
  const tagStack = [];
  let skipDepth = 0;

  const tagRe = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  let m;
  while ((m = tagRe.exec(cleaned)) !== null) {
    const isClose = m[1] === '/';
    const tag = m[2].toLowerCase().replace(/^.*:/, '');
    const attrStr = m[3] || '';
    const isSelfClosing = m[4] === '/';

    if (isClose) {
      if (skipDepth > 0) {
        if (SKIP_CONTAINERS.has(tag)) skipDepth--;
        continue;
      }
      if (tagStack.length > 0) {
        const popped = tagStack.pop();
        if (popped.pushedState && stateStack.length > 1) stateStack.pop();
      }
      continue;
    }

    if (skipDepth > 0) {
      if (!isSelfClosing && SKIP_CONTAINERS.has(tag)) skipDepth++;
      continue;
    }

    if (SKIP_CONTAINERS.has(tag)) {
      if (!isSelfClosing) skipDepth++;
      continue;
    }

    const attrs = parseAttrs(attrStr);
    const parentState = stateStack[stateStack.length - 1];
    const nextState = mergeState(parentState, attrs);

    if (tag === 'svg') {
      if (attrs.viewBox && !viewBox) {
        const vb = parseNums(attrs.viewBox);
        if (vb.length >= 4 && vb[2] >= 0 && vb[3] >= 0) {
          viewBox = [vb[0], vb[1], vb[2], vb[3]];
        }
      }
      if (attrs.width && width === null) {
        const wv = parseLength(attrs.width);
        if (wv != null && wv > 0) width = wv;
      }
      if (attrs.height && height === null) {
        const hv = parseLength(attrs.height);
        if (hv != null && hv > 0) height = hv;
      }
    }

    let subpaths = null;
    if (tag === 'path') {
      subpaths = parsePathD(attrs.d || '');
    } else if (tag === 'circle') {
      const cx = parseLength(attrs.cx) || 0;
      const cy = parseLength(attrs.cy) || 0;
      const r = parseLength(attrs.r) || 0;
      subpaths = ellipseSubpath(cx, cy, r, r);
    } else if (tag === 'ellipse') {
      const cx = parseLength(attrs.cx) || 0;
      const cy = parseLength(attrs.cy) || 0;
      const rx = parseLength(attrs.rx) || 0;
      const ry = parseLength(attrs.ry) || 0;
      subpaths = ellipseSubpath(cx, cy, rx, ry);
    } else if (tag === 'rect') {
      const x = parseLength(attrs.x) || 0;
      const y = parseLength(attrs.y) || 0;
      const w = parseLength(attrs.width) || 0;
      const h = parseLength(attrs.height) || 0;
      const rx = attrs.rx != null ? parseLength(attrs.rx) : null;
      const ry = attrs.ry != null ? parseLength(attrs.ry) : null;
      subpaths = rectSubpath(x, y, w, h, rx, ry);
    } else if (tag === 'polygon') {
      subpaths = polySubpath(attrs.points || '', true);
    } else if (tag === 'polyline') {
      subpaths = polySubpath(attrs.points || '', false);
    } else if (tag === 'line') {
      const x1 = parseLength(attrs.x1) || 0;
      const y1 = parseLength(attrs.y1) || 0;
      const x2 = parseLength(attrs.x2) || 0;
      const y2 = parseLength(attrs.y2) || 0;
      subpaths = [{ pts: [[x1, y1], [x2, y2]], closed: false }];
    }

    if (
      subpaths &&
      subpaths.length > 0 &&
      nextState.display !== 'none' &&
      nextState.visibility !== 'hidden' &&
      nextState.opacity > 0
    ) {
      shapes.push({
        subpaths,
        transform: nextState.transform,
        fill: nextState.fill,
        stroke: nextState.stroke,
        strokeWidth: nextState.strokeWidth,
        strokeDasharray: nextState.strokeDasharray,
        strokeDashoffset: nextState.strokeDashoffset,
        opacity: nextState.opacity,
        fillOpacity: nextState.fillOpacity,
        strokeOpacity: nextState.strokeOpacity,
        fillRule: nextState.fillRule,
      });
    }

    if (!isSelfClosing) {
      const pushState = tag === 'g' || tag === 'svg' || tag === 'a';
      if (pushState) stateStack.push(nextState);
      tagStack.push({ tag, pushedState: pushState });
    }
  }

  return { viewBox, width, height, shapes };
}

// --- Normalize Input (SVG string OR structured descriptor) ---
function normalizeInput(svgOrPaths) {
  if (typeof svgOrPaths === 'string') {
    return parseSvg(svgOrPaths);
  }
  if (!svgOrPaths || typeof svgOrPaths !== 'object') {
    return { viewBox: null, width: null, height: null, shapes: [] };
  }

  let viewBox = null;
  if (Array.isArray(svgOrPaths.viewBox) && svgOrPaths.viewBox.length >= 4) {
    viewBox = svgOrPaths.viewBox.slice(0, 4).map(Number);
  } else if (typeof svgOrPaths.viewBox === 'string') {
    const vb = parseNums(svgOrPaths.viewBox);
    if (vb.length >= 4) viewBox = vb.slice(0, 4);
  }

  const rawShapes = Array.isArray(svgOrPaths.shapes)
    ? svgOrPaths.shapes
    : Array.isArray(svgOrPaths.paths)
      ? svgOrPaths.paths
      : [];

  const shapes = [];
  for (const sh of rawShapes) {
    if (!sh || typeof sh !== 'object') continue;
    let subpaths = [];
    if (Array.isArray(sh.subpaths)) {
      subpaths = sh.subpaths;
    } else if (typeof sh.d === 'string') {
      subpaths = parsePathD(sh.d);
    } else if (sh.type === 'circle') {
      subpaths = ellipseSubpath(sh.cx || 0, sh.cy || 0, sh.r || 0, sh.r || 0);
    } else if (sh.type === 'ellipse') {
      subpaths = ellipseSubpath(sh.cx || 0, sh.cy || 0, sh.rx || 0, sh.ry || 0);
    } else if (sh.type === 'rect') {
      subpaths = rectSubpath(sh.x || 0, sh.y || 0, sh.width ?? sh.w ?? 0, sh.height ?? sh.h ?? 0, sh.rx, sh.ry);
    } else if (sh.type === 'line') {
      subpaths = [{ pts: [[sh.x1 || 0, sh.y1 || 0], [sh.x2 || 0, sh.y2 || 0]], closed: false }];
    } else if (Array.isArray(sh.pts)) {
      subpaths = [{ pts: sh.pts, closed: sh.closed !== false }];
    } else if (typeof sh.points === 'string') {
      subpaths = polySubpath(sh.points, sh.type !== 'polyline' && sh.closed !== false);
    }

    if (!subpaths.length) continue;
    const transform = Array.isArray(sh.transform) && sh.transform.length === 6
      ? sh.transform
      : typeof sh.transform === 'string'
        ? parseTransform(sh.transform)
        : IDENT;

    shapes.push({
      subpaths,
      transform,
      fill: sh.fill !== undefined ? sh.fill : '#000000',
      stroke: sh.stroke !== undefined ? sh.stroke : 'none',
      strokeWidth: sh.strokeWidth ?? sh['stroke-width'] ?? 1,
      strokeDasharray: Array.isArray(sh.strokeDasharray)
        ? sh.strokeDasharray
        : parseDashArray(sh.strokeDasharray ?? sh['stroke-dasharray']),
      strokeDashoffset: sh.strokeDashoffset ?? sh['stroke-dashoffset'] ?? 0,
      opacity: sh.opacity ?? 1,
      fillOpacity: sh.fillOpacity ?? sh['fill-opacity'] ?? 1,
      strokeOpacity: sh.strokeOpacity ?? sh['stroke-opacity'] ?? 1,
      fillRule: sh.fillRule ?? sh['fill-rule'] ?? 'nonzero',
    });
  }

  return {
    viewBox,
    width: svgOrPaths.width ?? null,
    height: svgOrPaths.height ?? null,
    shapes,
  };
}

// --- Shared Placement & Geometry Preparation ---
function zeroBBox(x, y) {
  const fx = Number.isFinite(x) ? x : 0;
  const fy = Number.isFinite(y) ? y : 0;
  return { x: fx, y: fy, w: 0, h: 0, x0: fx, y0: fy, x1: fx, y1: fy };
}

function prepareSvg(svgOrPaths, x = 0, y = 0, opts = {}) {
  const parsed = normalizeInput(svgOrPaths);
  if (!parsed.shapes.length) {
    return { bbox: zeroBBox(x, y), shapes: [], worldMatrix: IDENT };
  }

  // Transform each shape into SVG root user space and compute raw geometry AABB
  let rawMinX = Infinity;
  let rawMinY = Infinity;
  let rawMaxX = -Infinity;
  let rawMaxY = -Infinity;

  const userShapes = [];
  for (const sh of parsed.shapes) {
    const userSubpaths = [];
    for (const sp of sh.subpaths) {
      if (!sp || !Array.isArray(sp.pts) || sp.pts.length === 0) continue;
      const pts = [];
      for (const p of sp.pts) {
        if (!Array.isArray(p) || p.length < 2) continue;
        const [tx, ty] = matApply(sh.transform, p[0], p[1]);
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
        pts.push([tx, ty]);
        if (tx < rawMinX) rawMinX = tx;
        if (ty < rawMinY) rawMinY = ty;
        if (tx > rawMaxX) rawMaxX = tx;
        if (ty > rawMaxY) rawMaxY = ty;
      }
      if (pts.length > 0) userSubpaths.push({ pts, closed: !!sp.closed });
    }
    if (userSubpaths.length > 0) {
      userShapes.push({ ...sh, userSubpaths });
    }
  }

  if (!userShapes.length || !Number.isFinite(rawMinX)) {
    return { bbox: zeroBBox(x, y), shapes: [], worldMatrix: IDENT };
  }

  // Determine source viewBox
  let vbX;
  let vbY;
  let vbW;
  let vbH;
  if (parsed.viewBox && parsed.viewBox[2] > 0 && parsed.viewBox[3] > 0) {
    [vbX, vbY, vbW, vbH] = parsed.viewBox;
  } else if (parsed.width > 0 && parsed.height > 0) {
    vbX = 0;
    vbY = 0;
    vbW = parsed.width;
    vbH = parsed.height;
  } else {
    vbX = rawMinX;
    vbY = rawMinY;
    vbW = rawMaxX - rawMinX;
    vbH = rawMaxY - rawMinY;
  }

  // Compute target scale (sx, sy) preserving aspect ratio if only w or h is given
  let sx = 1;
  let sy = 1;
  const hasW = opts.w != null && Number.isFinite(opts.w) && opts.w > 0;
  const hasH = opts.h != null && Number.isFinite(opts.h) && opts.h > 0;
  if (hasW && hasH) {
    sx = vbW > 0 ? opts.w / vbW : 1;
    sy = vbH > 0 ? opts.h / vbH : 1;
  } else if (hasW) {
    const s = vbW > 0 ? opts.w / vbW : 1;
    sx = s;
    sy = s;
  } else if (hasH) {
    const s = vbH > 0 ? opts.h / vbH : 1;
    sx = s;
    sy = s;
  } else if (opts.scale != null && Number.isFinite(opts.scale)) {
    sx = opts.scale;
    sy = opts.scale;
  }

  const tw = vbW * sx;
  const th = vbH * sy;
  const anchor = opts.anchor || 'bottom-center';
  let ox = -tw / 2;
  let oy = -th;
  if (anchor === 'center') {
    ox = -tw / 2;
    oy = -th / 2;
  } else if (anchor === 'top-left') {
    ox = 0;
    oy = 0;
  }

  // Compose world matrix:
  // 1. Shift viewBox origin to (0, 0), scale by (sx, sy), shift by anchor offset (ox, oy)
  let M = [sx, 0, 0, sy, ox - vbX * sx, oy - vbY * sy];

  // 2. Optional flipX / flipY around the shape's local anchored center
  if (opts.flipX || opts.flipY) {
    const fcx = ox + tw / 2;
    const fcy = oy + th / 2;
    const fx = opts.flipX ? -1 : 1;
    const fy = opts.flipY ? -1 : 1;
    const flipM = matMul(matMul([1, 0, 0, 1, fcx, fcy], [fx, 0, 0, fy, 0, 0]), [1, 0, 0, 1, -fcx, -fcy]);
    M = matMul(flipM, M);
  }

  // 3. Optional rotation around anchor origin (0, 0)
  const rotRad = opts.rot != null ? opts.rot : opts.rotDeg != null ? (opts.rotDeg * Math.PI) / 180 : 0;
  if (rotRad) {
    const cs = Math.cos(rotRad);
    const sn = Math.sin(rotRad);
    M = matMul([cs, sn, -sn, cs, 0, 0], M);
  }

  // 4. Translate to final map position (x, y)
  M = matMul([1, 0, 0, 1, x, y], M);

  // Transform all subpaths to final mm coordinates and compute exact mm BBox
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const finalShapes = [];
  for (const sh of userShapes) {
    const mmSubpaths = [];
    for (const sp of sh.userSubpaths) {
      const mmPts = [];
      for (const [ux, uy] of sp.pts) {
        const [mx, my] = matApply(M, ux, uy);
        if (!Number.isFinite(mx) || !Number.isFinite(my)) continue;
        mmPts.push([mx, my]);
        if (mx < minX) minX = mx;
        if (my < minY) minY = my;
        if (mx > maxX) maxX = mx;
        if (my > maxY) maxY = my;
      }
      if (mmPts.length > 0) mmSubpaths.push({ pts: mmPts, closed: sp.closed });
    }
    if (mmSubpaths.length > 0) {
      finalShapes.push({
        ...sh,
        mmSubpaths,
        geomScale: matScale(matMul(M, sh.transform)),
      });
    }
  }

  if (!Number.isFinite(minX)) {
    return { bbox: zeroBBox(x, y), shapes: [], worldMatrix: M };
  }

  const w = maxX - minX;
  const h = maxY - minY;
  const bbox = { x: minX, y: minY, w, h, x0: minX, y0: minY, x1: minX + w, y1: minY + h };
  return { bbox, shapes: finalShapes, worldMatrix: M };
}

function measureSvg(svgOrPaths, x = 0, y = 0, opts = {}) {
  return prepareSvg(svgOrPaths, x, y, opts).bbox;
}

// --- Geometry & Stroke Helpers ---
function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a) * 0.5;
}

function dedupePts(pts) {
  const out = [];
  for (const p of pts) {
    if (!out.length) {
      out.push(p);
    } else {
      const prev = out[out.length - 1];
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-4) {
        out.push(p);
      }
    }
  }
  return out;
}

function strokeDashed(P, pts, dashArr, dashOffset, inkOpts) {
  const dashes = dashArr.length % 2 === 1 ? [...dashArr, ...dashArr] : dashArr.slice();
  const cycle = dashes.reduce((a, b) => a + b, 0);
  if (cycle <= 1e-6) {
    P.ink(pts, inkOpts);
    return;
  }

  let off = ((dashOffset % cycle) + cycle) % cycle;
  let dashIdx = 0;
  while (off >= dashes[dashIdx]) {
    off -= dashes[dashIdx];
    dashIdx = (dashIdx + 1) % dashes.length;
  }
  let rem = dashes[dashIdx] - off;
  let drawing = dashIdx % 2 === 0;
  let run = drawing ? [pts[0]] : [];

  for (let i = 1; i < pts.length; i++) {
    let x0 = pts[i - 1][0];
    let y0 = pts[i - 1][1];
    const x1 = pts[i][0];
    const y1 = pts[i][1];
    let segLen = Math.hypot(x1 - x0, y1 - y0);
    if (segLen <= 1e-6) continue;

    while (segLen > 1e-6) {
      if (segLen < rem) {
        if (drawing) run.push([x1, y1]);
        rem -= segLen;
        segLen = 0;
      } else {
        const t = rem / segLen;
        const nx = x0 + (x1 - x0) * t;
        const ny = y0 + (y1 - y0) * t;
        if (drawing) {
          run.push([nx, ny]);
          if (run.length >= 2) P.ink(run, inkOpts);
          run = [];
        }
        x0 = nx;
        y0 = ny;
        segLen -= rem;
        dashIdx = (dashIdx + 1) % dashes.length;
        rem = dashes[dashIdx];
        drawing = dashIdx % 2 === 0;
        if (drawing) run = [[nx, ny]];
      }
    }
  }
  if (drawing && run.length >= 2) {
    P.ink(run, inkOpts);
  }
}

// --- Dry-Media SVG Renderer ---
function drawSvg(P, svgOrPaths, x = 0, y = 0, opts = {}) {
  const { bbox, shapes } = prepareSvg(svgOrPaths, x, y, opts);
  if (!shapes.length) return bbox;

  const fillStyle = opts.fillStyle || 'pencil';
  const nibScale = opts.nibScale ?? 1;
  const defaultNib = opts.defaultNib ?? 0.22;
  const defaultStroke = opts.defaultStroke;
  const tremor = opts.tremor ?? 0.55;
  const pressure = opts.pressure ?? 0.72;
  const passes = opts.passes ?? 2;
  const palette = opts.palette;

  for (const sh of shapes) {
    const fillRes = resolveColor(sh.fill, palette, defaultStroke);
    const strokeRes = resolveColor(sh.stroke, palette, defaultStroke);
    const effFillOp = sh.opacity * sh.fillOpacity * (fillRes ? fillRes.alpha : 0);
    const effStrokeOp = sh.opacity * sh.strokeOpacity * (strokeRes ? strokeRes.alpha : 0);

    // 1. Fill pass (guard tiny/degenerate rings)
    if (fillRes && effFillOp > 0) {
      const validRings = [];
      for (const sp of sh.mmSubpaths) {
        const cleaned = dedupePts(sp.pts);
        if (cleaned.length >= 3 && ringArea(cleaned) >= 0.01) {
          validRings.push(cleaned);
        }
      }

      if (validRings.length > 0) {
        const compoundPoly = validRings.length === 1 ? validRings[0] : validRings;
        const hasExplicitStroke = !!(strokeRes && effStrokeOp > 0);
        const wantAutoOutline = !hasExplicitStroke && opts.outline !== false;

        if (fillStyle === 'wash') {
          wash(P, [validRings], fillRes.hex, {
            strength: Math.max(0, Math.min(1, 0.76 * effFillOp)),
            reset: false,
          });
          if (!hasExplicitStroke && opts.outline === true) {
            for (const r of validRings) {
              P.ink([...r, r[0]], {
                nib: Math.max(0.08, Math.min(1.5, defaultNib * nibScale)),
                color: defaultStroke || PALETTE.ink,
                tremor,
              });
            }
          }
        } else if (fillStyle === 'hatch') {
          if (effFillOp >= 0.99 && opts.paperReset !== false) {
            P.paper([validRings]);
          }
          P.hatch([validRings], {
            color: fillRes.hex,
            pencil: true,
            pressure: Math.max(0.1, Math.min(1, pressure * effFillOp)),
            angle: opts.hatchAngle ?? 45,
            pitch: opts.hatchPitch ?? 0.75,
            nib: opts.hatchNib ?? 0.13,
          });
          if (wantAutoOutline) {
            for (const r of validRings) {
              P.ink([...r, r[0]], {
                nib: Math.max(0.08, Math.min(1.5, defaultNib * nibScale)),
                color: defaultStroke || PALETTE.ink,
                tremor,
              });
            }
          }
        } else {
          // Default: 'pencil'
          if (effFillOp < 0.99) {
            wash(P, [validRings], fillRes.hex, {
              strength: Math.max(0, Math.min(1, 0.72 * effFillOp)),
              reset: false,
            });
            if (wantAutoOutline) {
              for (const r of validRings) {
                P.ink([...r, r[0]], {
                  nib: Math.max(0.08, Math.min(1.5, defaultNib * nibScale)),
                  color: defaultStroke || PALETTE.ink,
                  tremor,
                });
              }
            }
          } else {
            part(P, compoundPoly, fillRes.hex, {
              pressure,
              passes,
              outline: wantAutoOutline,
              nib: Math.max(0.08, Math.min(1.5, defaultNib * nibScale)),
              outlineColor: defaultStroke,
            });
          }
        }
      }
    }

    // 2. Explicit stroke pass (uses P.ink directly so small shapes and dashes are preserved)
    if (strokeRes && effStrokeOp > 0 && sh.strokeWidth > 0) {
      const geomScale = sh.geomScale > 0 ? sh.geomScale : 1;
      const nib = Math.max(0.08, Math.min(1.5, sh.strokeWidth * geomScale * nibScale));
      const inkOpts = { nib, color: strokeRes.hex, tremor };
      const scaledDash = sh.strokeDasharray ? sh.strokeDasharray.map((d) => d * geomScale) : null;
      const scaledOff = (sh.strokeDashoffset || 0) * geomScale;

      for (const sp of sh.mmSubpaths) {
        let pts = dedupePts(sp.pts);
        if (pts.length === 0) continue;
        if (pts.length === 1) {
          P.dot(pts[0][0], pts[0][1], Math.max(0.15, nib * 0.6), strokeRes.hex);
          continue;
        }
        if (sp.closed) {
          pts = [...pts, pts[0]];
        }
        if (scaledDash) {
          strokeDashed(P, pts, scaledDash, scaledOff, inkOpts);
        } else {
          P.ink(pts, inkOpts);
        }
      }
    }
  }

  return bbox;
}

module.exports = {
  parsePathD,
  parseSvg,
  measureSvg,
  drawSvg,
};
