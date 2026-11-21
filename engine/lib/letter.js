'use strict';
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { hexToRgb } = require('../kit/util');

const FONTS = path.join(__dirname, '..', 'fonts');
const FACES = {
  serif: 'Kevin Serif',
  'serif-bold': 'Kevin Serif Bold',
  sans: 'Kevin Sans',
  'sans-bold': 'Kevin Sans Bold',
};

const REGISTERED = [];
const REGISTERED_BY_NAME = new Map();
const CUSTOM_SCRIPT_FONTS = {
  han: [],
  kana: [],
  hangul: [],
  cjkPunct: [],
};

function recordFont(entry) {
  const existing = REGISTERED_BY_NAME.get(entry.name);
  if (existing) {
    Object.assign(existing, entry);
    return existing;
  }
  const normalized = {
    name: entry.name,
    source: entry.source || 'system',
    scripts: Array.isArray(entry.scripts) ? [...entry.scripts] : ['latin'],
    faces: Array.isArray(entry.faces) ? [...entry.faces] : [],
    bold: !!entry.bold,
    ...(entry.path ? { path: entry.path } : {}),
  };
  REGISTERED.push(normalized);
  REGISTERED_BY_NAME.set(normalized.name, normalized);
  return normalized;
}

function tryRegisterFont(filePath, alias, meta = {}) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const ok = GlobalFonts.registerFromPath(filePath, alias);
    if (!ok && typeof GlobalFonts.has === 'function' && !GlobalFonts.has(alias)) {
      return false;
    }
    recordFont({ name: alias, path: filePath, ...meta });
    return true;
  } catch {
    return false;
  }
}

// 1. Bundled Latin fonts (preserved 100% identical to original)
tryRegisterFont(path.join(FONTS, 'KevinSerif-Regular.ttf'), FACES.serif, {
  source: 'bundled',
  scripts: ['latin'],
  faces: ['serif'],
  bold: false,
});
tryRegisterFont(path.join(FONTS, 'KevinSerif-Bold.ttf'), FACES['serif-bold'], {
  source: 'bundled',
  scripts: ['latin'],
  faces: ['serif-bold'],
  bold: true,
});
tryRegisterFont(path.join(FONTS, 'KevinSans-Regular.ttf'), FACES.sans, {
  source: 'bundled',
  scripts: ['latin'],
  faces: ['sans'],
  bold: false,
});
tryRegisterFont(path.join(FONTS, 'KevinSans-Bold.ttf'), FACES['sans-bold'], {
  source: 'bundled',
  scripts: ['latin'],
  faces: ['sans-bold'],
  bold: true,
});

// 2. Bundled OFL-1.1 hand-drawn brush-serif CJK font
const BUNDLED_CJK_NAME = 'ZCOOL XiaoWei';
const hasBundledCJK = tryRegisterFont(
  path.join(FONTS, 'ZCOOLXiaoWei-Regular.ttf'),
  BUNDLED_CJK_NAME,
  {
    source: 'bundled',
    scripts: ['han', 'cjkPunct'],
    faces: ['serif', 'serif-bold', 'sans', 'sans-bold'],
    bold: false,
  },
);

// 3. Safe OS CJK fallback discovery (Linux, macOS, Windows)
const OS_CJK_CANDIDATES = [
  // Linux — Noto CJK, WenQuanYi, IPA, Nanum, Unifont
  ['/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc', 'Noto Serif CJK', ['han', 'kana', 'hangul', 'cjkPunct'], ['serif'], false],
  ['/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc', 'Noto Serif CJK Bold', ['han', 'kana', 'hangul', 'cjkPunct'], ['serif-bold'], true],
  ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'Noto Sans CJK', ['han', 'kana', 'hangul', 'cjkPunct'], ['sans'], false],
  ['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 'Noto Sans CJK Bold', ['han', 'kana', 'hangul', 'cjkPunct'], ['sans-bold'], true],
  ['/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 'WenQuanYi Zen Hei', ['han', 'cjkPunct'], ['sans'], false],
  ['/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf', 'IPAPGothic', ['kana', 'han', 'cjkPunct'], ['sans'], false],
  ['/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', 'IPAGothic', ['kana', 'han', 'cjkPunct'], ['sans'], false],
  ['/usr/share/fonts/opentype/ipafont-mincho/ipamp.ttf', 'IPAMincho', ['kana', 'han', 'cjkPunct'], ['serif'], false],
  ['/usr/share/fonts/truetype/nanum/NanumMyeongjo.ttf', 'NanumMyeongjo', ['hangul'], ['serif'], false],
  ['/usr/share/fonts/truetype/nanum/NanumGothic.ttf', 'NanumGothic', ['hangul'], ['sans'], false],
  ['/usr/share/fonts/opentype/unifont/unifont.otf', 'Unifont', ['han', 'kana', 'hangul', 'cjkPunct'], ['sans'], false],
  // macOS
  ['/System/Library/Fonts/Supplemental/Songti.ttc', 'Songti SC', ['han', 'cjkPunct'], ['serif'], false],
  ['/System/Library/Fonts/PingFang.ttc', 'PingFang SC', ['han', 'cjkPunct'], ['sans'], false],
  ['/System/Library/Fonts/ヒラギノ明朝 ProN.ttc', 'Hiragino Mincho ProN', ['kana', 'han', 'cjkPunct'], ['serif'], false],
  ['/System/Library/Fonts/Hiragino Sans GB.ttc', 'Hiragino Sans GB', ['kana', 'han', 'cjkPunct'], ['sans'], false],
  ['/System/Library/Fonts/AppleSDGothicNeo.ttc', 'Apple SD Gothic Neo', ['hangul'], ['sans'], false],
  // Windows
  ['C:\\Windows\\Fonts\\simkai.ttf', 'KaiTi', ['han', 'cjkPunct'], ['serif'], false],
  ['C:\\Windows\\Fonts\\simsun.ttc', 'SimSun', ['han', 'cjkPunct'], ['serif'], false],
  ['C:\\Windows\\Fonts\\msyh.ttc', 'Microsoft YaHei', ['han', 'cjkPunct'], ['sans'], false],
  ['C:\\Windows\\Fonts\\yumin.ttf', 'Yu Mincho', ['kana', 'han', 'cjkPunct'], ['serif'], false],
  ['C:\\Windows\\Fonts\\malgun.ttf', 'Malgun Gothic', ['hangul'], ['sans'], false],
];

for (const [filePath, alias, scripts, faces, bold] of OS_CJK_CANDIDATES) {
  tryRegisterFont(filePath, alias, { source: 'system', scripts, faces, bold });
}

// Also inspect GlobalFonts.families for pre-loaded OS CJK fonts
const KNOWN_SYSTEM_FAMILIES = [
  ['Noto Serif CJK SC', ['han', 'cjkPunct'], ['serif'], false],
  ['Noto Serif CJK TC', ['han', 'cjkPunct'], ['serif'], false],
  ['Noto Serif CJK JP', ['kana', 'han', 'cjkPunct'], ['serif'], false],
  ['Noto Serif CJK KR', ['hangul', 'han', 'cjkPunct'], ['serif'], false],
  ['Noto Sans CJK SC', ['han', 'cjkPunct'], ['sans'], false],
  ['Noto Sans CJK TC', ['han', 'cjkPunct'], ['sans'], false],
  ['Noto Sans CJK JP', ['kana', 'han', 'cjkPunct'], ['sans'], false],
  ['Noto Sans CJK KR', ['hangul', 'han', 'cjkPunct'], ['sans'], false],
  ['WenQuanYi Zen Hei', ['han', 'cjkPunct'], ['sans'], false],
  ['IPAPGothic', ['kana', 'han', 'cjkPunct'], ['sans'], false],
  ['IPAGothic', ['kana', 'han', 'cjkPunct'], ['sans'], false],
  ['IPAMincho', ['kana', 'han', 'cjkPunct'], ['serif'], false],
  ['PingFang SC', ['han', 'cjkPunct'], ['sans'], false],
  ['Hiragino Mincho ProN', ['kana', 'han', 'cjkPunct'], ['serif'], false],
  ['Apple SD Gothic Neo', ['hangul'], ['sans'], false],
  ['Malgun Gothic', ['hangul'], ['sans'], false],
  ['KaiTi', ['han', 'cjkPunct'], ['serif'], false],
  ['SimSun', ['han', 'cjkPunct'], ['serif'], false],
];

try {
  const sysFams = new Set((GlobalFonts.families || []).map((f) => f && f.family).filter(Boolean));
  for (const [name, scripts, faces, bold] of KNOWN_SYSTEM_FAMILIES) {
    if (sysFams.has(name) && !REGISTERED_BY_NAME.has(name)) {
      recordFont({ name, source: 'system', scripts, faces, bold });
    }
  }
} catch {
  // Ignore on minimal environments where GlobalFonts.families may be unavailable
}

function registerFont(name, filePath, opts = {}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('registerFont: font name must be a non-empty string');
  }
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`registerFont("${name}"): filePath must be a non-empty string`);
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`registerFont("${name}"): font file not found at "${resolved}"`);
  }
  let ok;
  try {
    ok = GlobalFonts.registerFromPath(resolved, name);
  } catch (err) {
    throw new Error(`registerFont("${name}"): failed to load "${resolved}": ${err.message}`);
  }
  if (!ok && typeof GlobalFonts.has === 'function' && !GlobalFonts.has(name)) {
    throw new Error(`registerFont("${name}"): @napi-rs/canvas rejected font file "${resolved}"`);
  }

  const scripts = Array.isArray(opts.scripts) && opts.scripts.length
    ? [...opts.scripts]
    : ['latin', 'han', 'kana', 'hangul', 'cjkPunct'];
  const faces = opts.face ? [opts.face] : [];
  if (opts.face) {
    FACES[opts.face] = name;
  }
  if (opts.cjk || Array.isArray(opts.scripts)) {
    for (const sc of scripts) {
      if (CUSTOM_SCRIPT_FONTS[sc] && !CUSTOM_SCRIPT_FONTS[sc].includes(name)) {
        CUSTOM_SCRIPT_FONTS[sc].unshift(name);
      }
    }
  }

  recordFont({
    name,
    source: 'custom',
    scripts,
    faces,
    bold: !!opts.bold,
    path: resolved,
  });

  return { name, path: resolved, source: 'custom' };
}

function listFonts() {
  return REGISTERED.map((f) => ({
    name: f.name,
    source: f.source,
    scripts: [...f.scripts],
    faces: [...f.faces],
    bold: f.bold,
    ...(f.path ? { path: f.path } : {}),
  }));
}

// --- Script Detection ---
const RE_HANGUL = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/;
const RE_KANA = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uFF65-\uFF9F]/;
const RE_HAN = /\p{Script=Han}/u;
const RE_CJK_PUNCT = /[\u3000-\u303F\uFE30-\uFE4F\uFF00-\uFF64\uFFE0-\uFFEF]/;

function detectScript(ch) {
  const c = [...String(ch || '')][0] || '';
  if (!c) return 'latin';
  if (RE_HANGUL.test(c)) return 'hangul';
  if (RE_KANA.test(c)) return 'kana';
  if (RE_HAN.test(c)) return 'han';
  if (RE_CJK_PUNCT.test(c)) return 'cjkPunct';
  return 'latin';
}

function hasCJK(text) {
  for (const ch of String(text || '')) {
    if (detectScript(ch) !== 'latin') return true;
  }
  return false;
}

// --- Font Stack Resolution ---
const probe = createCanvas(8, 8).getContext('2d');
const fontOf = (face, px) => `${px}px "${FACES[face] || face}"`;

function discoveredForScript(script, preferSans, preferBold) {
  const matches = REGISTERED.filter((f) => f.source === 'system' && f.scripts.includes(script));
  matches.sort((a, b) => {
    const score = (f) => {
      let s = 0;
      if (f.name === 'Unifont') s -= 20;
      if (preferBold && f.bold) s += 4;
      if (!preferBold && !f.bold) s += 2;
      const isSans = f.faces.includes('sans') || f.faces.includes('sans-bold');
      if (preferSans === isSans) s += 3;
      if (script === 'kana' && /IPA|JP|Hiragino|Yu Mincho/i.test(f.name)) s += 5;
      if (script === 'hangul' && /Nanum|KR|Apple SD|Malgun/i.test(f.name)) s += 5;
      if ((script === 'han' || script === 'cjkPunct') && /SC|Noto|Songti|KaiTi|WenQuanYi/i.test(f.name)) s += 2;
      return s;
    };
    return score(b) - score(a);
  });
  return matches.map((f) => f.name);
}

function stackForScript(face, script) {
  if (script === 'latin') {
    return [FACES[face] || face];
  }
  const isCustomFace = !(face in FACES) && !!face;
  const preferSans = face === 'sans' || face === 'sans-bold';
  const preferBold = face === 'serif-bold' || face === 'sans-bold';
  const list = [];
  const pushUnique = (name) => {
    if (name && !list.includes(name)) list.push(name);
  };

  if (isCustomFace) pushUnique(face);
  for (const cf of CUSTOM_SCRIPT_FONTS[script] || []) pushUnique(cf);

  const discovered = discoveredForScript(script, preferSans, preferBold);

  if (script === 'han' || script === 'cjkPunct') {
    if (hasBundledCJK) pushUnique(BUNDLED_CJK_NAME);
    for (const d of discovered) pushUnique(d);
  } else {
    // kana & hangul: OS JP/KR fonts first because ZCOOL XiaoWei lacks Kana/Hangul
    for (const d of discovered) pushUnique(d);
    if (hasBundledCJK) pushUnique(BUNDLED_CJK_NAME);
  }

  pushUnique(preferSans ? 'sans-serif' : 'serif');
  return list;
}

function fontForScript(face, script, px) {
  if (script === 'latin') return fontOf(face, px);
  const stack = stackForScript(face, script);
  const formatted = stack.map((f) => (f === 'serif' || f === 'sans-serif' ? f : `"${f}"`));
  return `${px}px ${formatted.join(', ')}`;
}

function needsSyntheticBold(face, script, o = {}) {
  if (script === 'latin') return false;
  const wantsBold = face === 'serif-bold' || face === 'sans-bold' || o.bold === true;
  if (!wantsBold) return false;
  const top = stackForScript(face, script)[0];
  const meta = REGISTERED_BY_NAME.get(top);
  return !(meta && meta.bold);
}

// --- Unified mm BBox ---
function makeBBox(x0, y0, w, h) {
  const rx = Number.isFinite(x0) ? x0 : 0;
  const ry = Number.isFinite(y0) ? y0 : 0;
  const rw = Number.isFinite(w) && w > 0 ? w : 0;
  const rh = Number.isFinite(h) && h > 0 ? h : 0;
  return { x: rx, y: ry, w: rw, h: rh, x0: rx, y0: ry, x1: rx + rw, y1: ry + rh };
}

function unionBBox(...boxes) {
  const valid = boxes.filter((b) => b && Number.isFinite(b.x0) && Number.isFinite(b.y0) && Number.isFinite(b.x1) && Number.isFinite(b.y1));
  if (!valid.length) return makeBBox(0, 0, 0, 0);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of valid) {
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  return makeBBox(x0, y0, x1 - x0, y1 - y0);
}

function resolveAngle(o = {}) {
  if (typeof o.angle === 'number' && Number.isFinite(o.angle)) return o.angle;
  if (typeof o.rotateDeg === 'number' && Number.isFinite(o.rotateDeg)) return (o.rotateDeg * Math.PI) / 180;
  return 0;
}

// Segment string into contiguous runs of identical script
function segmentRuns(text) {
  const chars = [...String(text || '')];
  const runs = [];
  for (const ch of chars) {
    const script = detectScript(ch);
    if (runs.length && runs[runs.length - 1].script === script) {
      runs[runs.length - 1].text += ch;
      runs[runs.length - 1].chars.push(ch);
    } else {
      runs.push({ script, text: ch, chars: [ch] });
    }
  }
  return runs;
}

// --- Measurement ---
function measure(text, face = 'sans', size = 4, spacing = 0) {
  const str = String(text ?? '');
  if (!str) return 0;
  if (!hasCJK(str)) {
    probe.font = fontOf(face, 100);
    return (probe.measureText(str).width / 100) * size + spacing * size * Math.max(0, [...str].length - 1);
  }
  const cjkScale = 0.94;
  const chars = [...str];
  let total = 0;
  const runs = segmentRuns(str);
  for (const run of runs) {
    const isCjk = run.script !== 'latin';
    const px = isCjk ? 100 * cjkScale : 100;
    probe.font = fontForScript(face, run.script, px);
    total += (probe.measureText(run.text).width / 100) * size;
  }
  total += spacing * size * Math.max(0, chars.length - 1);
  return total;
}

function measureMetricsMm(text, face, size, spacing, cjkScale) {
  const str = String(text ?? '');
  if (!str) return { w: 0, ascent: 0, descent: 0 };
  const chars = [...str];
  let w = 0;
  let ascent = 0;
  let descent = 0;

  if (!hasCJK(str)) {
    probe.font = fontOf(face, 100);
    const m = probe.measureText(str);
    w = (m.width / 100) * size + spacing * size * Math.max(0, chars.length - 1);
    const a = m.actualBoundingBoxAscent;
    const d = m.actualBoundingBoxDescent;
    ascent = Number.isFinite(a) && a > 0 ? (a / 100) * size : size * 0.85;
    descent = Number.isFinite(d) && d >= 0 ? (d / 100) * size : size * 0.22;
  } else {
    const runs = segmentRuns(str);
    for (const run of runs) {
      const isCjk = run.script !== 'latin';
      const px = isCjk ? 100 * cjkScale : 100;
      probe.font = fontForScript(face, run.script, px);
      const m = probe.measureText(run.text);
      w += (m.width / 100) * size;
      const a = m.actualBoundingBoxAscent;
      const d = m.actualBoundingBoxDescent;
      const ra = Number.isFinite(a) && a > 0 ? (a / 100) * size : size * (isCjk ? 0.88 * cjkScale : 0.85);
      const rd = Number.isFinite(d) && d >= 0 ? (d / 100) * size : size * (isCjk ? 0.16 * cjkScale : 0.22);
      if (ra > ascent) ascent = ra;
      if (rd > descent) descent = rd;
    }
    w += spacing * size * Math.max(0, chars.length - 1);
  }
  return { w, ascent, descent };
}

function rotatedCornersBBox(lx0, ly0, lx1, ly1, x, y, angle) {
  if (!angle) {
    return makeBBox(x + lx0, y + ly0, lx1 - lx0, ly1 - ly0);
  }
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const corners = [
    [lx0, ly0],
    [lx1, ly0],
    [lx1, ly1],
    [lx0, ly1],
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [cx, cy] of corners) {
    const rx = x + cx * cos - cy * sin;
    const ry = y + cx * sin + cy * cos;
    if (rx < minX) minX = rx;
    if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }
  return makeBBox(minX, minY, maxX - minX, maxY - minY);
}

function measureExtendedSlantSpanMm(str, face, size, spacing, cjkScale, slant, alignOff) {
  const chars = [...str];
  const spMm = spacing * size;
  let curX = -alignOff;
  let lx0 = Infinity;
  let lx1 = -Infinity;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const script = detectScript(ch);
    const isCjk = script !== 'latin';
    const charSize = isCjk ? size * cjkScale : size;
    const px = isCjk ? 100 * cjkScale : 100;
    probe.font = fontForScript(face, script, px);
    const m = probe.measureText(ch);
    const cw = (m.width / 100) * size;
    const isSpace = /\s/.test(ch);
    const a = m.actualBoundingBoxAscent;
    const d = m.actualBoundingBoxDescent;
    const asc = isSpace ? 0 : (Number.isFinite(a) && a > 0 ? (a / 100) * size : charSize * (isCjk ? 0.88 : 0.85));
    const desc = isSpace ? 0 : (Number.isFinite(d) && d >= 0 ? (d / 100) * size : charSize * (isCjk ? 0.16 : 0.22));
    const effSlant = isSpace ? 0 : (isCjk ? slant * 0.55 : slant);
    const pivot = charSize * 0.35;
    const topShift = effSlant * (asc - pivot);
    const botShift = -effSlant * (desc + pivot);
    const cMinX = curX + Math.min(topShift, botShift);
    const cMaxX = curX + cw + Math.max(topShift, botShift);
    if (cMinX < lx0) lx0 = cMinX;
    if (cMaxX > lx1) lx1 = cMaxX;
    curX += cw + (i < chars.length - 1 ? spMm : 0);
  }
  return { lx0, lx1 };
}

function measureBox(text, o = {}) {
  const x = o.x ?? 0;
  const y = o.y ?? 0;
  const str = String(text ?? '');

  if (o.sub) {
    const layout = o.bilingualLayout || o.layout || 'stack';
    const size = o.size || 4;
    const face = o.face || 'serif-bold';
    const secondarySize = o.secondarySize ?? o.subSize ?? size * 0.68;
    const secondaryFace = o.secondaryFace ?? o.subFace ?? 'sans';
    const gap = o.gap ?? size * 0.35;
    const sep = o.sep ?? ' · ';
    const angle = resolveAngle(o);
    const primOpts = { ...o, face, size, sub: undefined, bilingualLayout: undefined, layout: undefined };
    const secOpts = {
      ...primOpts,
      face: secondaryFace,
      size: secondarySize,
      spacing: o.secondarySpacing ?? 0,
    };

    if (layout === 'inline') {
      const w1 = measure(str, face, size, o.spacing || 0);
      const wSep = measure(sep, secondaryFace, secondarySize, 0);
      const w2 = measure(String(o.sub), secondaryFace, secondarySize, 0);
      const totalW = w1 + wSep + w2;
      const align = o.align || 'left';
      const off = align === 'center' ? -totalW / 2 : align === 'right' ? -totalW : 0;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const b1 = measureBox(str, { ...primOpts, align: 'left', x: x + off * cos, y: y + off * sin });
      const b2 = measureBox(String(o.sub), {
        ...secOpts,
        align: 'left',
        x: x + (off + w1 + wSep) * cos,
        y: y + (off + w1 + wSep) * sin,
      });
      const u = unionBBox(b1, b2);
      return { ...u, ascent: Math.max(b1.ascent, b2.ascent), descent: Math.max(b1.descent, b2.descent) };
    }

    const b1 = measureBox(str, primOpts);
    const m2 = measureBox(String(o.sub), { ...secOpts, x: 0, y: 0, angle: 0, rotateDeg: undefined });
    const dy = Math.max(gap + secondarySize * 1.05, b1.descent + Math.max(0.4, gap * 0.5) + m2.ascent);
    const x2 = angle ? x - Math.sin(angle) * dy : x;
    const y2 = angle ? y + Math.cos(angle) * dy : y + dy;
    const b2 = measureBox(String(o.sub), { ...secOpts, x: x2, y: y2 });
    const u = unionBBox(b1, b2);
    return { ...u, ascent: b1.ascent, descent: u.y1 - y };
  }

  if (!str) {
    return { ...makeBBox(x, y, 0, 0), ascent: 0, descent: 0 };
  }

  const face = o.face || 'sans';
  const size = o.size || 4;
  const spacing = o.spacing || 0;
  const align = o.align || 'left';
  const slant = o.slant || 0;
  const cjkScale = o.cjkScale ?? 0.94;
  const angle = resolveAngle(o);

  const { w, ascent, descent } = measureMetricsMm(str, face, size, spacing, cjkScale);
  const alignOff = align === 'center' ? w / 2 : align === 'right' ? w : 0;

  let lx0 = -alignOff;
  let lx1 = lx0 + w;

  if (slant !== 0) {
    const isPureLatinFastPath = !hasCJK(str) && angle === 0 && !o.halo && !(o.jitter > 0);
    if (isPureLatinFastPath) {
      // Match exact pure-Latin fast-path canvas transform
      const padMm = size * 0.5;
      const shiftBase = -slant * padMm - size * slant * 0.62;
      const topShift = shiftBase + slant * ascent;
      const botShift = shiftBase - slant * descent;
      lx0 += Math.min(topShift, botShift);
      lx1 += Math.max(topShift, botShift);
    } else {
      const span = measureExtendedSlantSpanMm(str, face, size, spacing, cjkScale, slant, alignOff);
      lx0 = span.lx0;
      lx1 = span.lx1;
    }
  }

  const bb = rotatedCornersBBox(lx0, -ascent, lx1, descent, x, y, angle);
  return { ...bb, ascent, descent };
}

// --- Core Text Writer ---
function resolveHalo(o, S) {
  if (!o.halo) return null;
  const h = typeof o.halo === 'object' ? o.halo : {};
  const colorStr = typeof o.halo === 'string' ? o.halo : h.color;
  return {
    widthMm: h.width ?? 0.35,
    opacity: h.opacity ?? 0.82,
    rgb: colorStr ? hexToRgb(colorStr) : null,
    fallbackRgb: S.paperSpec && S.paperSpec.base ? S.paperSpec.base : [245, 241, 231],
  };
}

function write(S, text, x, y, o = {}) {
  const str = String(text ?? '');
  if (o.sub) {
    const { sub, bilingualLayout, ...rest } = o;
    return writeBilingual(S, str, sub, x, y, {
      ...rest,
      layout: bilingualLayout || rest.layout || 'stack',
    });
  }
  if (!str) {
    return makeBBox(x, y, 0, 0);
  }

  const { ppm, W, H, tooth, rgb, fill } = S;
  const face = o.face || 'sans';
  const size = o.size || 4;
  const px = size * ppm;
  const sp = (o.spacing || 0) * px;
  const col = hexToRgb(o.color || '#2b2420');
  const opac = o.opacity ?? 0.97;
  const reach = o.reach ?? 0.9;
  const soft = 0.32;
  const slant = o.slant || 0;
  const angle = resolveAngle(o);
  const cjk = hasCJK(str);

  // 100% backward-compatible pure-Latin fast-path (exact RNG & pixel parity)
  const isPureLatinFastPath = !cjk && angle === 0 && !o.halo && !(o.jitter > 0);
  if (isPureLatinFastPath) {
    probe.font = fontOf(face, px);
    const chars = [...str];
    const widths = chars.map((c) => probe.measureText(c).width);
    const fullM = probe.measureText(str);
    const w = sp ? widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1) : fullM.width;
    const pad = Math.ceil(px * 0.5);
    const cw = Math.ceil(w + 2 * pad);
    const ch = Math.ceil(px * 1.6 + 2 * pad);
    const c = createCanvas(cw + Math.ceil(px * Math.abs(slant)), ch);
    const g = c.getContext('2d');
    if (slant) g.setTransform(1, 0, -slant, 1, px * slant * 1.05, 0);
    g.font = fontOf(face, px);
    g.fillStyle = '#000';
    g.textBaseline = 'alphabetic';
    const base = pad + px * 1.05;
    if (sp) {
      let cx = pad;
      chars.forEach((ch1, i) => {
        g.fillText(ch1, cx, base);
        cx += widths[i] + sp;
      });
    } else {
      g.fillText(str, pad, base);
    }
    const a = g.getImageData(0, 0, c.width, ch).data;
    const cwide = c.width;
    const alignOff = o.align === 'center' ? w / 2 : o.align === 'right' ? w : 0;
    const x0 = Math.round(x * ppm - alignOff - pad - px * slant * 0.62);
    const y0 = Math.round(y * ppm - base);
    const R = S.R;
    const ph = R() * 6.28;
    const amp = o.wobble ?? 0.06;
    for (let yy = 0; yy < ch; yy++) {
      const Y = y0 + yy;
      if (Y < 0 || Y >= H) continue;
      for (let xx = 0; xx < cwide; xx++) {
        const al = a[4 * (yy * cwide + xx) + 3];
        if (!al) continue;
        const X = x0 + xx;
        if (X < 0 || X >= W) continue;
        const i = Y * W + X;
        const h = tooth[i];
        let k = (h - (1 - reach)) / soft + 0.5;
        k = k < 0 ? 0 : k > 1 ? 1 : k;
        const p = 1 - amp + amp * Math.sin(ph + (xx / px) * 2.1);
        const d = (al / 255) * (0.55 + 0.45 * k) * opac * p;
        const j = 3 * i;
        rgb[j] += (col[0] - rgb[j]) * d;
        rgb[j + 1] += (col[1] - rgb[j + 1]) * d;
        rgb[j + 2] += (col[2] - rgb[j + 2]) * d;
        const nf = fill[i] + d * 60;
        fill[i] = nf > 255 ? 255 : nf;
      }
    }

    const ascPx = Number.isFinite(fullM.actualBoundingBoxAscent) && fullM.actualBoundingBoxAscent > 0
      ? fullM.actualBoundingBoxAscent
      : px * 0.85;
    const descPx = Number.isFinite(fullM.actualBoundingBoxDescent) && fullM.actualBoundingBoxDescent >= 0
      ? fullM.actualBoundingBoxDescent
      : px * 0.22;
    const v0 = base - ascPx;
    const v1 = base + descPx;
    const tx = (u, v) => (slant ? u - slant * v + px * slant * 1.05 : u);
    const minTx = Math.min(tx(pad, v0), tx(pad, v1));
    const maxTx = Math.max(tx(pad + w, v0), tx(pad + w, v1));
    return makeBBox(
      (x0 + minTx) / ppm,
      (y0 + v0) / ppm,
      (maxTx - minTx) / ppm,
      (v1 - v0) / ppm,
    );
  }

  // Extended path: CJK / mixed scripts / angled / halo / micro-jitter
  const cjkScale = o.cjkScale ?? 0.94;
  const jitter = o.jitter ?? (cjk ? 1 : 0);
  const haloSpec = resolveHalo(o, S);
  const haloRadiusPx = haloSpec ? Math.max(1, haloSpec.widthMm * ppm) : 0;

  const chars = [...str];
  const charInfos = [];
  let totalW = 0;
  let maxAscPx = 0;
  let maxDescPx = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const script = detectScript(ch);
    const isCjk = script !== 'latin';
    const charPx = isCjk ? px * cjkScale : px;
    const fontStr = fontForScript(face, script, charPx);
    probe.font = fontStr;
    const m = probe.measureText(ch);
    const cw1 = m.width;
    const isSpace = /\s/.test(ch);
    const asc = isSpace
      ? 0
      : (Number.isFinite(m.actualBoundingBoxAscent) && m.actualBoundingBoxAscent > 0
        ? m.actualBoundingBoxAscent
        : charPx * (isCjk ? 0.88 : 0.85));
    const desc = isSpace
      ? 0
      : (Number.isFinite(m.actualBoundingBoxDescent) && m.actualBoundingBoxDescent >= 0
        ? m.actualBoundingBoxDescent
        : charPx * (isCjk ? 0.16 : 0.22));
    if (asc > maxAscPx) maxAscPx = asc;
    if (desc > maxDescPx) maxDescPx = desc;
    charInfos.push({
      ch,
      script,
      isCjk,
      charPx,
      fontStr,
      w: cw1,
      asc,
      desc,
      synBold: needsSyntheticBold(face, script, o),
      effSlant: isCjk ? slant * 0.55 : slant,
      jy: 0,
      jrot: 0,
    });
    totalW += cw1;
    if (i < chars.length - 1) totalW += sp;
  }

  // Deterministic seed-based micro-jitter (never uses Math.random)
  const R = S.R;
  if (jitter > 0) {
    for (const ci of charInfos) {
      if (ci.isCjk || o.jitter > 0) {
        ci.jy = R.gauss(0, 0.018 * ci.charPx * jitter);
        ci.jrot = R.gauss(0, 0.018 * jitter);
      }
    }
  }

  const alignOff = o.align === 'center' ? totalW / 2 : o.align === 'right' ? totalW : 0;
  let lx0 = -alignOff;
  let lx1 = -alignOff + totalW;
  if (slant !== 0 && charInfos.length > 0) {
    lx0 = Infinity;
    lx1 = -Infinity;
    let curX = -alignOff;
    for (let i = 0; i < charInfos.length; i++) {
      const ci = charInfos[i];
      const pivot = ci.charPx * 0.35;
      const topShift = ci.effSlant * (ci.asc - pivot);
      const botShift = -ci.effSlant * (ci.desc + pivot);
      const cMinX = curX + Math.min(topShift, botShift);
      const cMaxX = curX + ci.w + Math.max(topShift, botShift);
      if (cMinX < lx0) lx0 = cMinX;
      if (cMaxX > lx1) lx1 = cMaxX;
      curX += ci.w + (i < charInfos.length - 1 ? sp : 0);
    }
  }
  const ly0 = -maxAscPx;
  const ly1 = maxDescPx;

  const pad = Math.ceil(px * 0.55 + haloRadiusPx + Math.max(2, px * 0.08 * jitter));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rawCorners = [
    [lx0 - pad, ly0 - pad],
    [lx1 + pad, ly0 - pad],
    [lx1 + pad, ly1 + pad],
    [lx0 - pad, ly1 + pad],
  ];
  let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
  for (const [cx, cy] of rawCorners) {
    const rx = cx * cos - cy * sin;
    const ry = cx * sin + cy * cos;
    if (rx < rMinX) rMinX = rx;
    if (ry < rMinY) rMinY = ry;
    if (rx > rMaxX) rMaxX = rx;
    if (ry > rMaxY) rMaxY = ry;
  }

  const cwide = Math.max(2, Math.ceil(rMaxX - rMinX));
  const chPx = Math.max(2, Math.ceil(rMaxY - rMinY));
  const ax = -rMinX;
  const ay = -rMinY;

  const drawGlyphs = (g, isHalo) => {
    g.save();
    g.translate(ax, ay);
    if (angle) g.rotate(angle);
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    g.textBaseline = 'alphabetic';
    let curX = -alignOff;
    for (const ci of charInfos) {
      g.save();
      g.translate(curX + ci.w / 2, -ci.charPx * 0.35 + ci.jy);
      if (ci.jrot) g.rotate(ci.jrot);
      if (ci.effSlant) g.transform(1, 0, -ci.effSlant, 1, 0, 0);
      g.translate(-ci.w / 2, ci.charPx * 0.35);
      g.font = ci.fontStr;
      if (isHalo) {
        g.lineWidth = haloRadiusPx * 2;
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.miterLimit = 2;
        g.strokeText(ci.ch, 0, 0);
        g.fillText(ci.ch, 0, 0);
      } else {
        if (ci.synBold) {
          g.lineWidth = Math.max(0.6, ci.charPx * 0.032);
          g.lineJoin = 'round';
          g.miterLimit = 2;
          g.strokeText(ci.ch, 0, 0);
        }
        g.fillText(ci.ch, 0, 0);
      }
      g.restore();
      curX += ci.w + sp;
    }
    g.restore();
  };

  const x0 = Math.round(x * ppm - ax);
  const y0 = Math.round(y * ppm - ay);

  // Optional paper halo composited BEFORE ink
  if (haloSpec) {
    const hc = createCanvas(cwide, chPx);
    const hg = hc.getContext('2d');
    drawGlyphs(hg, true);
    const ha = hg.getImageData(0, 0, cwide, chPx).data;
    const p0 = S.paper0;
    const hRgb = haloSpec.rgb;
    const fb = haloSpec.fallbackRgb;
    const hOp = haloSpec.opacity;
    for (let yy = 0; yy < chPx; yy++) {
      const Y = y0 + yy;
      if (Y < 0 || Y >= H) continue;
      for (let xx = 0; xx < cwide; xx++) {
        const al = ha[4 * (yy * cwide + xx) + 3];
        if (!al) continue;
        const X = x0 + xx;
        if (X < 0 || X >= W) continue;
        const j = 3 * (Y * W + X);
        const d = (al / 255) * hOp;
        const hr = hRgb ? hRgb[0] : (p0 ? p0[j] : fb[0]);
        const hg2 = hRgb ? hRgb[1] : (p0 ? p0[j + 1] : fb[1]);
        const hb = hRgb ? hRgb[2] : (p0 ? p0[j + 2] : fb[2]);
        rgb[j] += (hr - rgb[j]) * d;
        rgb[j + 1] += (hg2 - rgb[j + 1]) * d;
        rgb[j + 2] += (hb - rgb[j + 2]) * d;
      }
    }
  }

  // Main ink pass
  const c = createCanvas(cwide, chPx);
  const g = c.getContext('2d');
  drawGlyphs(g, false);
  const a = g.getImageData(0, 0, cwide, chPx).data;

  const ph = R() * 6.28;
  const amp = o.wobble ?? 0.06;
  for (let yy = 0; yy < chPx; yy++) {
    const Y = y0 + yy;
    if (Y < 0 || Y >= H) continue;
    for (let xx = 0; xx < cwide; xx++) {
      const al = a[4 * (yy * cwide + xx) + 3];
      if (!al) continue;
      const X = x0 + xx;
      if (X < 0 || X >= W) continue;
      const i = Y * W + X;
      const h = tooth[i];
      let k = (h - (1 - reach)) / soft + 0.5;
      k = k < 0 ? 0 : k > 1 ? 1 : k;
      const p = 1 - amp + amp * Math.sin(ph + (xx / px) * 2.1);
      const d = (al / 255) * (0.55 + 0.45 * k) * opac * p;
      const j = 3 * i;
      rgb[j] += (col[0] - rgb[j]) * d;
      rgb[j + 1] += (col[1] - rgb[j + 1]) * d;
      rgb[j + 2] += (col[2] - rgb[j + 2]) * d;
      const nf = fill[i] + d * 60;
      fill[i] = nf > 255 ? 255 : nf;
    }
  }

  // Return tight rotated mm BBox around (x, y)
  const strokePadMm = charInfos.some((ci) => ci.synBold) ? Math.max(0.6, px * 0.032) / (2 * ppm) : 0;
  return rotatedCornersBBox(
    lx0 / ppm - strokePadMm,
    ly0 / ppm - strokePadMm,
    lx1 / ppm + strokePadMm,
    ly1 / ppm + strokePadMm,
    x,
    y,
    angle,
  );
}

// --- Multi-line Block ---
function block(S, lines, cx, cy, o = {}) {
  const arr = Array.isArray(lines) ? lines : String(lines ?? '').split('\n');
  if (!arr.length) {
    return { ...makeBBox(cx, cy, 0, 0), lines: [] };
  }
  const size = o.size || 4;
  const lh = size * (o.lineGap || 1.3);
  const n = arr.length;
  const top = cy - ((n - 1) * lh) / 2 + size * 0.36;
  const lineBoxes = arr.map((t, i) => write(S, t, cx, top + i * lh, { align: 'center', ...o }));
  const nonEmpty = lineBoxes.filter((b) => b.w > 0 || b.h > 0);
  const u = nonEmpty.length ? unionBBox(...nonEmpty) : makeBBox(cx, cy, 0, 0);
  return { ...u, lines: lineBoxes };
}

// --- Curved Labels along Polyline ---
function samplePolyline(pts, cumLen, s) {
  const n = pts.length;
  const totalLen = cumLen[n - 1];
  if (s <= 0) {
    // Extrapolate backwards along first non-degenerate segment
    for (let i = 0; i < n - 1; i++) {
      const segLen = cumLen[i + 1] - cumLen[i];
      if (segLen > 1e-9) {
        const ux = (pts[i + 1][0] - pts[i][0]) / segLen;
        const uy = (pts[i + 1][1] - pts[i][1]) / segLen;
        return [pts[0][0] + ux * s, pts[0][1] + uy * s];
      }
    }
    return [pts[0][0], pts[0][1]];
  }
  if (s >= totalLen) {
    const extra = s - totalLen;
    for (let i = n - 2; i >= 0; i--) {
      const segLen = cumLen[i + 1] - cumLen[i];
      if (segLen > 1e-9) {
        const ux = (pts[i + 1][0] - pts[i][0]) / segLen;
        const uy = (pts[i + 1][1] - pts[i][1]) / segLen;
        return [pts[n - 1][0] + ux * extra, pts[n - 1][1] + uy * extra];
      }
    }
    return [pts[n - 1][0], pts[n - 1][1]];
  }
  let lo = 0, hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cumLen[mid] <= s) lo = mid;
    else hi = mid;
  }
  const segLen = cumLen[lo + 1] - cumLen[lo];
  const t = segLen > 1e-9 ? (s - cumLen[lo]) / segLen : 0;
  return [
    pts[lo][0] + (pts[lo + 1][0] - pts[lo][0]) * t,
    pts[lo][1] + (pts[lo + 1][1] - pts[lo][1]) * t,
  ];
}

function writeAlongPath(S, text, pts, o = {}) {
  const str = String(text ?? '');
  if (!str || !Array.isArray(pts) || pts.length === 0) {
    return makeBBox(0, 0, 0, 0);
  }
  if (pts.length === 1) {
    return write(S, str, pts[0][0], pts[0][1], { align: o.align || 'center', ...o, sub: undefined });
  }

  // Copy and auto-flip RTL curves so labels are never upside-down
  let pathPts = pts.map((p) => [p[0], p[1]]);
  if (o.autoFlip !== false && pathPts[pathPts.length - 1][0] < pathPts[0][0]) {
    pathPts = pathPts.reverse();
  }

  const cumLen = [0];
  for (let i = 1; i < pathPts.length; i++) {
    const dx = pathPts[i][0] - pathPts[i - 1][0];
    const dy = pathPts[i][1] - pathPts[i - 1][1];
    cumLen.push(cumLen[i - 1] + Math.hypot(dx, dy));
  }
  const totalLen = cumLen[cumLen.length - 1];
  if (!Number.isFinite(totalLen) || totalLen < 1e-4) {
    return write(S, str, pathPts[0][0], pathPts[0][1], { align: o.align || 'center', ...o, sub: undefined });
  }

  const face = o.face || 'sans';
  const size = o.size || 4;
  const spacingMm = (o.spacing || 0) * size;
  const chars = [...str];
  const adv = chars.map((ch) => Math.max(0.2, measure(ch, face, size, 0)));
  const textW = adv.reduce((a, b) => a + b, 0) + spacingMm * Math.max(0, chars.length - 1);

  const align = o.align || 'center';
  const offset = o.offset || 0;
  let cursor;
  if (align === 'left') cursor = offset;
  else if (align === 'right') cursor = totalLen - textW - offset;
  else cursor = (totalLen - textW) / 2 + offset;

  const charBoxes = [];
  for (let i = 0; i < chars.length; i++) {
    const sMid = cursor + adv[i] / 2;
    const [px, py] = samplePolyline(pathPts, cumLen, sMid);
    const delta = Math.max(0.25, adv[i] * 0.35);
    const p0 = samplePolyline(pathPts, cumLen, sMid - delta);
    const p1 = samplePolyline(pathPts, cumLen, sMid + delta);
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const bb = write(S, chars[i], px, py, {
      ...o,
      align: 'center',
      angle: ang,
      rotateDeg: undefined,
      spacing: 0,
      sub: undefined,
      bilingualLayout: undefined,
    });
    if (bb.w > 0 || bb.h > 0) charBoxes.push(bb);
    cursor += adv[i] + spacingMm;
  }

  return charBoxes.length ? unionBBox(...charBoxes) : makeBBox(pathPts[0][0], pathPts[0][1], 0, 0);
}

// --- Bilingual Labels (stack & inline) ---
function writeBilingual(S, primary, secondary, x, y, o = {}) {
  const primStr = String(primary ?? '');
  const secStr = String(secondary ?? '');
  const layout = o.layout || o.bilingualLayout || 'stack';
  const size = o.size || 4;
  const face = o.face || 'serif-bold';
  const secondarySize = o.secondarySize ?? o.subSize ?? size * 0.68;
  const secondaryFace = o.secondaryFace ?? o.subFace ?? 'sans';
  const secondaryColor = o.secondaryColor ?? o.subColor ?? o.color;
  const secondaryOpacity = o.secondaryOpacity ?? (o.opacity ?? 0.97) * 0.88;
  const gap = o.gap ?? size * 0.35;
  const sep = o.sep ?? ' · ';
  const angle = resolveAngle(o);

  const basePrimOpts = {
    ...o,
    face,
    size,
    sub: undefined,
    bilingualLayout: undefined,
    layout: undefined,
  };

  if (!secStr) {
    const bb1 = write(S, primStr, x, y, basePrimOpts);
    return { ...bb1, primary: bb1, secondary: null };
  }

  const baseSecOpts = {
    ...basePrimOpts,
    face: secondaryFace,
    size: secondarySize,
    color: secondaryColor,
    opacity: secondaryOpacity,
    spacing: o.secondarySpacing ?? 0,
  };

  if (layout === 'inline') {
    const align = o.align || 'left';
    const w1 = measure(primStr, face, size, o.spacing || 0);
    const wSep = measure(sep, secondaryFace, secondarySize, 0);
    const w2 = measure(secStr, secondaryFace, secondarySize, 0);
    const totalW = w1 + wSep + w2;
    const off = align === 'center' ? -totalW / 2 : align === 'right' ? -totalW : 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const bb1 = write(S, primStr, x + off * cos, y + off * sin, { ...basePrimOpts, align: 'left' });
    if (sep) {
      write(S, sep, x + (off + w1) * cos, y + (off + w1) * sin, { ...baseSecOpts, align: 'left' });
    }
    const bb2 = write(S, secStr, x + (off + w1 + wSep) * cos, y + (off + w1 + wSep) * sin, {
      ...baseSecOpts,
      align: 'left',
    });
    const u = unionBBox(bb1, bb2);
    return { ...u, primary: bb1, secondary: bb2 };
  }

  // Default: 'stack' layout
  const bb1 = write(S, primStr, x, y, basePrimOpts);
  const m1 = measureBox(primStr, { ...basePrimOpts, x: 0, y: 0, angle: 0, rotateDeg: undefined });
  const m2 = measureBox(secStr, { ...baseSecOpts, x: 0, y: 0, angle: 0, rotateDeg: undefined });
  const dy = Math.max(gap + secondarySize * 1.05, m1.descent + Math.max(0.4, gap * 0.5) + m2.ascent);
  const x2 = angle ? x - Math.sin(angle) * dy : x;
  const y2 = angle ? y + Math.cos(angle) * dy : y + dy;
  const bb2 = write(S, secStr, x2, y2, baseSecOpts);
  const u = unionBBox(bb1, bb2);
  return { ...u, primary: bb1, secondary: bb2 };
}

module.exports = {
  write,
  block,
  measure,
  measureBox,
  writeAlongPath,
  writeBilingual,
  registerFont,
  detectScript,
  hasCJK,
  listFonts,
  FACES,
};
