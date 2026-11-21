'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const K = require('../engine/kit');
const Lt = require('../engine/lib/letter');
const {
  createMap,
  block,
  writeAlongPath,
  writeBilingual,
  registerFont,
  measureBox,
  listFonts,
} = require('../src');

function blankSheet(w = 80, h = 40, ppm = 6, seed = 'letter-test') {
  return K.sheet({ id: 't', w, h, ppm, paper: 'hotpress', seed });
}

function assertValidBBox(bb, label = 'bbox', { allowEmpty = false } = {}) {
  assert.ok(bb && typeof bb === 'object', `${label}: expected bbox object`);
  for (const k of ['x', 'y', 'w', 'h', 'x0', 'y0', 'x1', 'y1']) {
    assert.equal(typeof bb[k], 'number', `${label}.${k} must be number`);
    assert.ok(Number.isFinite(bb[k]), `${label}.${k} must be finite, got ${bb[k]}`);
  }
  assert.equal(bb.x, bb.x0, `${label}: x === x0`);
  assert.equal(bb.y, bb.y0, `${label}: y === y0`);
  assert.ok(Math.abs(bb.x1 - (bb.x + bb.w)) < 1e-9, `${label}: x1 === x + w`);
  assert.ok(Math.abs(bb.y1 - (bb.y + bb.h)) < 1e-9, `${label}: y1 === y + h`);
  assert.ok(bb.w >= 0 && bb.h >= 0, `${label}: non-negative w/h`);
  if (!allowEmpty) {
    assert.ok(bb.w > 0 && bb.h > 0, `${label}: expected positive w/h, got ${bb.w}x${bb.h}`);
  }
}

function inkPixels(S, fillThreshold = 2) {
  const { W, H, fill } = S;
  let count = 0;
  let fillSum = 0;
  let minX = W, maxX = -1, minY = H, maxY = -1;
  let sumX = 0, sumY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const f = fill[y * W + x];
      if (f > fillThreshold) {
        count++;
        fillSum += f;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    count,
    fillSum,
    minX,
    maxX,
    minY,
    maxY,
    cxMm: count ? sumX / count / S.ppm : 0,
    cyMm: count ? sumY / count / S.ppm : 0,
  };
}

function inkStatsInBox(S, bb, marginMm = 0, fillThreshold = 2) {
  const { W, H, ppm, fill } = S;
  const x0 = Math.max(0, Math.floor((bb.x0 - marginMm) * ppm));
  const y0 = Math.max(0, Math.floor((bb.y0 - marginMm) * ppm));
  const x1 = Math.min(W - 1, Math.ceil((bb.x1 + marginMm) * ppm));
  const y1 = Math.min(H - 1, Math.ceil((bb.y1 + marginMm) * ppm));
  let insideCount = 0;
  let totalCount = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (fill[y * W + x] > fillThreshold) {
        totalCount++;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) insideCount++;
      }
    }
  }
  const boxAreaPx = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  return {
    insideCount,
    totalCount,
    density: insideCount / boxAreaPx,
    containment: totalCount ? insideCount / totalCount : 1,
  };
}

function inkMaskDiffRatio(S1, S2, bb1, bb2, fillThreshold = 2) {
  const ppm = S1.ppm;
  const x0 = Math.max(0, Math.floor(Math.min(bb1.x0, bb2.x0) * ppm) - 2);
  const y0 = Math.max(0, Math.floor(Math.min(bb1.y0, bb2.y0) * ppm) - 2);
  const x1 = Math.min(S1.W - 1, Math.ceil(Math.max(bb1.x1, bb2.x1) * ppm) + 2);
  const y1 = Math.min(S1.H - 1, Math.ceil(Math.max(bb1.y1, bb2.y1) * ppm) + 2);
  let xorCount = 0;
  let unionCount = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const a = S1.fill[y * S1.W + x] > fillThreshold;
      const b = S2.fill[y * S2.W + x] > fillThreshold;
      if (a || b) unionCount++;
      if (a !== b) xorCount++;
    }
  }
  return unionCount ? xorCount / unionCount : 0;
}

// =========================================================================
// Group 1: Non-Tofu CJK Pixel-Diff Proof
// =========================================================================
test('Group 1: CJK strings render genuine distinct glyphs (non-tofu proof) and synthetic bold', () => {
  const S1 = blankSheet(80, 40, 6, 'cjk-diff');
  const S2 = blankSheet(80, 40, 6, 'cjk-diff');
  const bb1 = Lt.write(S1, '四川盆地', 40, 20, { face: 'serif-bold', size: 6, align: 'center' });
  const bb2 = Lt.write(S2, '江南水乡', 40, 20, { face: 'serif-bold', size: 6, align: 'center' });

  assertValidBBox(bb1, '四川盆地');
  assertValidBBox(bb2, '江南水乡');

  const st1 = inkStatsInBox(S1, bb1, 0.5);
  const st2 = inkStatsInBox(S2, bb2, 0.5);
  assert.ok(st1.density >= 0.05 && st1.density <= 0.85, `realistic ink density 1: ${st1.density}`);
  assert.ok(st2.density >= 0.05 && st2.density <= 0.85, `realistic ink density 2: ${st2.density}`);

  const diff = inkMaskDiffRatio(S1, S2, bb1, bb2);
  assert.ok(diff > 0.15, `expected distinct CJK glyph masks (diff > 0.15), got ${diff.toFixed(3)}`);

  // Synthetic bold should increase total deposited ink vs regular weight on CJK
  const Sreg = blankSheet(60, 30, 6, 'syn-bold');
  const Sbold = blankSheet(60, 30, 6, 'syn-bold');
  Lt.write(Sreg, '成都', 30, 16, { face: 'sans', size: 6, align: 'center' });
  Lt.write(Sbold, '成都', 30, 16, { face: 'sans-bold', size: 6, align: 'center' });
  const pReg = inkPixels(Sreg);
  const pBold = inkPixels(Sbold);
  assert.ok(pBold.fillSum > pReg.fillSum, `synthetic bold fillSum (${pBold.fillSum}) should exceed regular (${pReg.fillSum})`);
});

test('Group 1: mixed CJK + Latin string renders both scripts with ink', () => {
  const S = blankSheet(90, 40, 6, 'mixed-script');
  const bb = Lt.write(S, '成都 Chengdu 2026', 45, 20, { face: 'serif-bold', size: 5, align: 'center' });
  assertValidBBox(bb, 'mixed');
  const thirdW = bb.w / 3;
  const leftBox = { x0: bb.x0, y0: bb.y0, x1: bb.x0 + thirdW, y1: bb.y1 };
  const rightBox = { x0: bb.x1 - thirdW, y0: bb.y0, x1: bb.x1, y1: bb.y1 };
  assert.ok(inkStatsInBox(S, leftBox, 0.5).insideCount > 20, 'left third (Han) should have ink');
  assert.ok(inkStatsInBox(S, rightBox, 0.5).insideCount > 20, 'right third (Latin/digits) should have ink');
});

test('Group 1: OS fallback for Kana and Hangul (strict diff when OS fonts present, safe otherwise)', () => {
  const fonts = Lt.listFonts();
  const hasKanaFont = fonts.some((f) => f.source === 'system' && f.scripts.includes('kana'));
  const hasHangulFont = fonts.some((f) => f.source === 'system' && f.scripts.includes('hangul'));

  const SJ1 = blankSheet(80, 40, 6, 'kana');
  const SJ2 = blankSheet(80, 40, 6, 'kana');
  const bJ1 = Lt.write(SJ1, '東京さくら', 40, 20, { face: 'serif-bold', size: 6, align: 'center' });
  const bJ2 = Lt.write(SJ2, '京都もみじ', 40, 20, { face: 'serif-bold', size: 6, align: 'center' });
  assertValidBBox(bJ1, 'kana1');
  assertValidBBox(bJ2, 'kana2');
  if (hasKanaFont) {
    assert.ok(inkMaskDiffRatio(SJ1, SJ2, bJ1, bJ2) > 0.15, 'Kana strings should differ when JP font present');
  }

  const SK1 = blankSheet(80, 40, 6, 'hangul');
  const SK2 = blankSheet(80, 40, 6, 'hangul');
  const bK1 = Lt.write(SK1, '서울특별시', 40, 20, { face: 'sans-bold', size: 6, align: 'center' });
  const bK2 = Lt.write(SK2, '부산광역시', 40, 20, { face: 'sans-bold', size: 6, align: 'center' });
  assertValidBBox(bK1, 'hangul1');
  assertValidBBox(bK2, 'hangul2');
  if (hasHangulFont) {
    assert.ok(inkMaskDiffRatio(SK1, SK2, bK1, bK2) > 0.15, 'Hangul strings should differ when KR font present');
  }
});

// =========================================================================
// Group 2: BBox Accuracy & Invariants
// =========================================================================
test('Group 2: write() returned BBox tightly encloses >=95% of inked pixels', () => {
  const cases = [
    ['latin-left', 'Tokyo', 20, 20, { face: 'serif-bold', size: 5, align: 'left' }],
    ['latin-center', 'Tokyo', 40, 20, { face: 'serif-bold', size: 5, align: 'center' }],
    ['latin-right', 'Tokyo', 60, 20, { face: 'serif-bold', size: 5, align: 'right' }],
    ['cjk-center', '四川省成都市', 40, 20, { face: 'serif-bold', size: 6, align: 'center' }],
    ['mixed-spaced', '京都 Kyoto', 40, 20, { face: 'sans-bold', size: 5, align: 'center', spacing: 0.12 }],
    ['cjk-slanted', '太平洋', 40, 20, { face: 'serif-bold', size: 6, align: 'center', slant: 0.22 }],
    ['latin-slanted', 'PACIFIC', 40, 20, { face: 'serif-bold', size: 5, align: 'center', slant: 0.22 }],
  ];

  for (const [label, text, x, y, opts] of cases) {
    const S = blankSheet(80, 40, 6, `bbox-${label}`);
    const bb = Lt.write(S, text, x, y, opts);
    assertValidBBox(bb, label);
    const st = inkStatsInBox(S, bb, 1.0);
    assert.ok(st.totalCount > 20, `${label}: expected visible ink`);
    assert.ok(
      st.containment >= 0.95,
      `${label}: expected >=95% ink inside bbox+1mm, got ${(st.containment * 100).toFixed(1)}%`,
    );
  }
});

test('Group 2: measure() and measureBox() agree with write()', () => {
  const w = Lt.measure('四川盆地', 'serif-bold', 6);
  const mb = Lt.measureBox('四川盆地', { face: 'serif-bold', size: 6, align: 'center', x: 40, y: 20 });
  assertValidBBox(mb, 'measureBox');
  assert.ok(mb.ascent > 0 && mb.descent >= 0, 'ascent > 0 and descent >= 0');
  assert.ok(Math.abs(w - mb.w) < 0.15, `measure (${w}) should match measureBox.w (${mb.w})`);

  const S = blankSheet(80, 40, 6, 'mb-agree');
  const wb = Lt.write(S, '四川盆地', 40, 20, { face: 'serif-bold', size: 6, align: 'center' });
  assert.ok(Math.abs(wb.w - mb.w) <= 1.5, `write.w (${wb.w}) ~ measureBox.w (${mb.w})`);
  assert.ok(Math.abs(wb.h - mb.h) <= 1.5, `write.h (${wb.h}) ~ measureBox.h (${mb.h})`);
});

test('Group 2: block() returns unified BBox + per-line BBoxes stacked vertically', () => {
  const S = blankSheet(90, 50, 5, 'block-test');
  const res = Lt.block(S, ['四川盆地', 'Sichuan Basin', '天府之国'], 45, 25, { size: 4 });
  assertValidBBox(res, 'block');
  assert.equal(res.lines.length, 3);
  for (let i = 0; i < res.lines.length; i++) {
    assertValidBBox(res.lines[i], `line[${i}]`);
    if (i > 0) {
      assert.ok(res.lines[i].y0 > res.lines[i - 1].y0, 'lines must stack vertically');
    }
  }
  const st = inkStatsInBox(S, res, 1.0);
  assert.ok(st.containment >= 0.95, `block ink containment >=95%, got ${(st.containment * 100).toFixed(1)}%`);

  // Empty block returns safe finite BBox
  const empty = Lt.block(S, [], 45, 25, { size: 4 });
  assertValidBBox(empty, 'empty-block', { allowEmpty: true });
  assert.deepEqual(empty.lines, []);
});

// =========================================================================
// Group 3: Bilingual Labels (stack & inline) + { sub } Shorthand
// =========================================================================
test('Group 3: writeBilingual() stack layout is non-overlapping with ink in both lines', () => {
  const S = blankSheet(80, 40, 6, 'bi-stack');
  const res = Lt.writeBilingual(S, '成都', 'Chengdu', 40, 18, { size: 5, align: 'center', layout: 'stack' });
  assertValidBBox(res, 'bi-stack');
  assertValidBBox(res.primary, 'bi-stack.primary');
  assertValidBBox(res.secondary, 'bi-stack.secondary');
  assert.ok(res.secondary.y0 >= res.primary.y1 - 0.1, `secondary.y0 (${res.secondary.y0}) >= primary.y1 (${res.primary.y1})`);
  assert.ok(res.x0 <= Math.min(res.primary.x0, res.secondary.x0) + 1e-6);
  assert.ok(res.x1 >= Math.max(res.primary.x1, res.secondary.x1) - 1e-6);
  assert.ok(res.y0 <= res.primary.y0 + 1e-6);
  assert.ok(res.y1 >= res.secondary.y1 - 1e-6);
  assert.ok(inkStatsInBox(S, res.primary, 0.5).insideCount > 10, 'primary region should have ink');
  assert.ok(inkStatsInBox(S, res.secondary, 0.5).insideCount > 10, 'secondary region should have ink');
});

test('Group 3: writeBilingual() inline layout fits on one line and expands width', () => {
  const S = blankSheet(90, 40, 6, 'bi-inline');
  const res = Lt.writeBilingual(S, '成都', 'Chengdu', 45, 20, { size: 4.5, align: 'center', layout: 'inline' });
  assertValidBBox(res, 'bi-inline');
  assertValidBBox(res.primary, 'bi-inline.primary');
  assertValidBBox(res.secondary, 'bi-inline.secondary');
  assert.ok(res.h < 4.5 * 2.2, `inline height (${res.h}) should be single-line`);
  assert.ok(res.w > Lt.measure('成都', 'serif-bold', 4.5), 'inline width should exceed primary alone');
  assert.ok(inkStatsInBox(S, res, 0.8).insideCount > 20);
});

test('Group 3: { sub } shorthand works across Lt.write and createMap() helpers', () => {
  const S = blankSheet(80, 40, 5, 'sub-write');
  const bb = Lt.write(S, '成都', 40, 18, { sub: 'Chengdu', size: 4.5, align: 'center' });
  assertValidBBox(bb, 'write-sub');
  assertValidBBox(bb.primary, 'write-sub.primary');
  assertValidBBox(bb.secondary, 'write-sub.secondary');
  assert.ok(inkStatsInBox(S, bb.primary, 0.5).insideCount > 10);
  assert.ok(inkStatsInBox(S, bb.secondary, 0.5).insideCount > 10);

  const map = createMap({ w: 110, h: 65, ppm: 4, ocean: false, border: false, seed: 'bilingual-map' });
  const cbb = map.city(25, 25, '成都', { capital: true, sub: 'Chengdu' });
  const lbb = map.label('峨眉山', 60, 20, { sub: 'Mt. Emei' });
  const sbb = map.seaLabel('东海', 90, 20, { sub: 'East China Sea' });
  const rbb = map.regionLabel('四川盆地', 55, 48, { sub: 'Sichuan Basin' });
  for (const [name, b] of [['city', cbb], ['label', lbb], ['seaLabel', sbb], ['regionLabel', rbb]]) {
    assertValidBBox(b, name);
    assert.ok(inkStatsInBox(map.P.S, b, 1.0).insideCount > 10, `${name} should deposit ink`);
  }
  // City bilingual stack default dy should lift secondary above the city dot at y = 25
  assert.ok(cbb.secondary.y1 <= 25 - 0.5, `city stacked secondary.y1 (${cbb.secondary.y1}) should clear dot at y=25`);

  // Verify top-level & map typography exports exist
  assert.equal(typeof block, 'function');
  assert.equal(typeof writeAlongPath, 'function');
  assert.equal(typeof writeBilingual, 'function');
  assert.equal(typeof registerFont, 'function');
  assert.equal(typeof measureBox, 'function');
  assert.equal(typeof listFonts, 'function');
  assert.equal(typeof map.block, 'function');
  assert.equal(typeof map.writeAlongPath, 'function');
  assert.equal(typeof map.writeBilingual, 'function');
  assert.equal(typeof map.measureBox, 'function');
  assert.equal(typeof map.registerFont, 'function');
  assert.equal(typeof map.listFonts, 'function');
});

// =========================================================================
// Group 4: Angled & Curved Labels (angle/rotateDeg & writeAlongPath)
// =========================================================================
test('Group 4: angle and rotateDeg produce identical rotated rendering and accurate BBox', () => {
  const S0 = blankSheet(80, 60, 6, 'rot');
  const bbHoriz = Lt.write(S0, '长江流域', 40, 30, { size: 5, align: 'center' });

  const S1 = blankSheet(80, 60, 6, 'rot');
  const S2 = blankSheet(80, 60, 6, 'rot');
  const bbDeg = Lt.write(S1, '长江流域', 40, 30, { size: 5, align: 'center', rotateDeg: 45 });
  const bbRad = Lt.write(S2, '长江流域', 40, 30, { size: 5, align: 'center', angle: Math.PI / 4 });

  assertValidBBox(bbDeg, 'rotateDeg');
  assertValidBBox(bbRad, 'angle');
  assert.ok(Buffer.from(S1.rgb.buffer).equals(Buffer.from(S2.rgb.buffer)), 'rotateDeg: 45 === angle: PI/4');
  assert.ok(bbDeg.h > bbHoriz.h * 1.3, `rotated h (${bbDeg.h}) > horizontal h (${bbHoriz.h}) * 1.3`);
  const st = inkStatsInBox(S1, bbDeg, 1.0);
  assert.ok(st.containment >= 0.95, `rotated ink containment >=95%, got ${(st.containment * 100).toFixed(1)}%`);
});

test('Group 4: writeAlongPath() curves, RTL auto-flip, degenerate curves, and empty strings', () => {
  const pts = [[15, 28], [35, 16], [55, 16], [75, 28]];
  const Slr = blankSheet(90, 45, 5, 'curve');
  const bLR = Lt.writeAlongPath(Slr, '长江三峡', pts, { face: 'serif-bold', size: 4.5 });
  assertValidBBox(bLR, 'curve-LR');
  const stLR = inkStatsInBox(Slr, bLR, 1.2);
  assert.ok(stLR.totalCount > 40);
  assert.ok(stLR.containment >= 0.95, `curve ink containment >=95%, got ${(stLR.containment * 100).toFixed(1)}%`);

  // Reversed (RTL) points should auto-flip so text renders upright in the same corridor
  const Srl = blankSheet(90, 45, 5, 'curve');
  const bRL = Lt.writeAlongPath(Srl, '长江三峡', pts.slice().reverse(), { face: 'serif-bold', size: 4.5 });
  assertValidBBox(bRL, 'curve-RL');
  const pLR = inkPixels(Slr);
  const pRL = inkPixels(Srl);
  assert.ok(Math.abs(pLR.cyMm - pRL.cyMm) < 2.0, `RTL auto-flip y-centroid (${pRL.cyMm}) ~ LR (${pLR.cyMm})`);

  // Short & degenerate curves never throw or produce NaN
  const Sdeg = blankSheet(60, 40, 4, 'deg');
  assertValidBBox(Lt.writeAlongPath(Sdeg, '四川盆地', [[30, 20], [31, 20]], { size: 4 }), 'short-curve');
  assertValidBBox(Lt.writeAlongPath(Sdeg, '四川', [[30, 20], [30, 20]], { size: 4 }), 'coincident');
  assertValidBBox(Lt.writeAlongPath(Sdeg, '川', [[30, 20]], { size: 4 }), 'single-pt');
  assertValidBBox(Lt.writeAlongPath(Sdeg, '川', [], { size: 4 }), 'empty-pts', { allowEmpty: true });

  // Empty strings
  const Sempty = blankSheet(40, 30, 4, 'empty');
  const bEmpty = Lt.write(Sempty, '', 20, 15, { size: 4 });
  assertValidBBox(bEmpty, 'empty-write', { allowEmpty: true });
  assert.equal(bEmpty.w, 0);
  assert.equal(inkPixels(Sempty).count, 0);
  assertValidBBox(Lt.writeAlongPath(Sempty, '', pts, { size: 4 }), 'empty-path', { allowEmpty: true });
  assert.equal(Lt.measure('', 'sans', 4), 0);
  const mbEmpty = Lt.measureBox('', { size: 4 });
  assertValidBBox(mbEmpty, 'empty-measureBox', { allowEmpty: true });
  assert.equal(mbEmpty.w, 0);
});

// =========================================================================
// Group 5: Pure-Latin Backward Compatibility, Seed Determinism & Halo
// =========================================================================
test('Group 5: detectScript(), hasCJK(), seed determinism (Latin & CJK), and halo', () => {
  assert.equal(Lt.hasCJK('Tokyo'), false);
  assert.equal(Lt.hasCJK("Côte d'Ivoire"), false);
  assert.equal(Lt.hasCJK('127°E'), false);
  assert.equal(Lt.hasCJK('成都'), true);
  assert.equal(Lt.hasCJK('東京'), true);
  assert.equal(Lt.hasCJK('さくら'), true);
  assert.equal(Lt.hasCJK('서울'), true);
  assert.equal(Lt.hasCJK('成都 Chengdu'), true);

  assert.equal(Lt.detectScript('A'), 'latin');
  assert.equal(Lt.detectScript('川'), 'han');
  assert.equal(Lt.detectScript('あ'), 'kana');
  assert.equal(Lt.detectScript('한'), 'hangul');

  // Pure-Latin determinism
  const L1 = blankSheet(70, 30, 5, 'det-1');
  const L2 = blankSheet(70, 30, 5, 'det-1');
  const L3 = blankSheet(70, 30, 5, 'det-2');
  Lt.write(L1, 'PACIFIC OCEAN', 35, 16, { face: 'serif-bold', size: 4, align: 'center', slant: 0.22 });
  Lt.write(L2, 'PACIFIC OCEAN', 35, 16, { face: 'serif-bold', size: 4, align: 'center', slant: 0.22 });
  Lt.write(L3, 'PACIFIC OCEAN', 35, 16, { face: 'serif-bold', size: 4, align: 'center', slant: 0.22 });
  assert.ok(Buffer.from(L1.rgb.buffer).equals(Buffer.from(L2.rgb.buffer)), 'same seed => identical Latin rgb');
  assert.ok(!Buffer.from(L1.rgb.buffer).equals(Buffer.from(L3.rgb.buffer)), 'different seed => different Latin rgb');

  // CJK determinism (including micro-jitter)
  const C1 = blankSheet(70, 30, 5, 'cjk-det-1');
  const C2 = blankSheet(70, 30, 5, 'cjk-det-1');
  const C3 = blankSheet(70, 30, 5, 'cjk-det-2');
  Lt.write(C1, '四川盆地', 35, 16, { face: 'serif-bold', size: 5, align: 'center' });
  Lt.write(C2, '四川盆地', 35, 16, { face: 'serif-bold', size: 5, align: 'center' });
  Lt.write(C3, '四川盆地', 35, 16, { face: 'serif-bold', size: 5, align: 'center' });
  assert.ok(Buffer.from(C1.rgb.buffer).equals(Buffer.from(C2.rgb.buffer)), 'same seed => identical CJK rgb');
  assert.ok(!Buffer.from(C1.rgb.buffer).equals(Buffer.from(C3.rgb.buffer)), 'different seed => different CJK rgb');

  // Paper halo renders cleanly without throwing
  const Sh = blankSheet(70, 30, 5, 'halo-test');
  const bh = Lt.write(Sh, '四川', 35, 16, { face: 'serif-bold', size: 5, align: 'center', halo: true });
  assertValidBBox(bh, 'halo');
  assert.ok(inkPixels(Sh).count > 20);
});

// =========================================================================
// Group 6: registerFont() & listFonts()
// =========================================================================
test('Group 6: listFonts() reports bundled Latin & CJK fonts and registerFont() works/validates', () => {
  const fonts = Lt.listFonts();
  assert.ok(Array.isArray(fonts) && fonts.length >= 5, 'listFonts returns bundled fonts');
  const names = fonts.map((f) => f.name);
  assert.ok(names.includes('Kevin Serif'));
  assert.ok(names.includes('Kevin Sans'));
  assert.ok(names.includes('ZCOOL XiaoWei'), 'bundled ZCOOL XiaoWei must be listed');

  const fontFile = path.join(__dirname, '..', 'engine', 'fonts', 'ZCOOLXiaoWei-Regular.ttf');
  const info = Lt.registerFont('TestCustomCJK', fontFile);
  assert.equal(info.name, 'TestCustomCJK');
  assert.ok(Lt.listFonts().some((f) => f.name === 'TestCustomCJK'), 'custom font appears in listFonts()');

  const S = blankSheet(70, 30, 5, 'custom-font');
  const bb = Lt.write(S, '自定义字体', 35, 16, { face: 'TestCustomCJK', size: 5, align: 'center' });
  assertValidBBox(bb, 'custom-font');
  assert.ok(inkPixels(S).count > 20);

  assert.throws(
    () => Lt.registerFont('MissingFont', '/nonexistent/path/to/missing-font.ttf'),
    /not found/i,
  );
  assert.throws(
    () => Lt.registerFont('', fontFile),
    /non-empty string/i,
  );
});

// =========================================================================
// Group 7: CJK-Safe drawCartouche() & drawInsetBox()
// =========================================================================
test('Group 7: drawCartouche() auto-scales long CJK title against flag and supports zh locale', () => {
  const map = createMap({ w: 96, h: 60, ppm: 4, ocean: false, border: false, seed: 'cart-cjk' });
  const x = 6, y = 6, w = 76, h = 44;
  map.cartouche(x, y, w, h, {
    country: '中华人民共和国四川省',
    subtitle: '天府之国',
    subtitleSub: 'Sichuan Province',
    lang: 'zh',
    flag: 'japan',
    capital: '成都',
    language: '汉语',
    population: '8367万',
    area: '48.6万 km²',
    factLabels: { capital: '省会' },
  });

  // Verify title auto-scaling math leaves clearance before flag left edge (x + w - 20.5)
  const maxTitleW = w - 28.0;
  const rawW = Lt.measure('中华人民共和国四川省', 'serif-bold', 9.2);
  assert.ok(rawW > maxTitleW, 'long CJK title exceeds raw available width and must trigger auto-scale');
  const scaledSize = Math.max(3.5, 9.2 * (maxTitleW / rawW));
  const scaledW = Lt.measure('中华人民共和国四川省', 'serif-bold', scaledSize);
  assert.ok(scaledW <= maxTitleW + 0.5, `scaled title width (${scaledW}) fits before flag (${maxTitleW})`);

  // Verify localized facts & legend deposited ink in lower left and lower right quadrants
  const leftFacts = inkStatsInBox(map.P.S, { x0: x + 4, y0: y + 19, x1: x + w * 0.55, y1: y + h - 8 });
  const rightLegend = inkStatsInBox(map.P.S, { x0: x + w * 0.55, y0: y + 19, x1: x + w - 4, y1: y + h - 8 });
  assert.ok(leftFacts.insideCount > 50, 'localized facts should render ink in lower-left quadrant');
  assert.ok(rightLegend.insideCount > 50, 'localized legend should render ink in lower-right quadrant');
});

test('Group 7: drawInsetBox() measures CJK title via Lt.measure and fits inside box', () => {
  const map = createMap({ w: 72, h: 50, ppm: 4, ocean: false, border: false, seed: 'inset-cjk' });
  const x = 6, y = 6, w = 56, h = 36;
  const title = '南海诸岛与周边海域';
  map.insetBox(x, y, w, h, title);

  const measured = Lt.measure(title, 'serif-bold', 2.3);
  assert.ok(measured > 0, 'measured CJK title width > 0');

  // Verify ink inside the title pill band stays strictly within the inset box interior
  const S = map.P.S;
  const yStart = Math.floor((y + 2.5) * S.ppm);
  const yEnd = Math.ceil((y + 7.0) * S.ppm);
  const rightLimitPx = Math.ceil((x + w - 1.1) * S.ppm);
  let pillInk = 0;
  for (let py = yStart; py <= yEnd; py++) {
    for (let px = Math.floor((x + 2.5) * S.ppm); px <= rightLimitPx; px++) {
      if (S.fill[py * S.W + px] > 2) pillInk++;
    }
  }
  assert.ok(pillInk > 30, 'inset box title pill should render CJK ink inside box bounds');
});

// =========================================================================
// Group 8: Regression Tests (Signed Slant BBox, Bilingual Default Face,
//          Narrow Cartouche Flag Clearance & Narrow InsetBox Containment)
// =========================================================================
test('Group 8: negative slant on extended Latin, CJK & mixed keeps ink in wb and matches measureBox', () => {
  const cases = [
    ['latin-360-neg-slant', 'TOKYO', { face: 'serif', size: 16, slant: -0.22, rotateDeg: 360, align: 'center', jitter: 0 }],
    ['latin-45-neg-slant', 'TOKYO', { face: 'serif', size: 16, slant: -0.22, rotateDeg: 45, align: 'center', jitter: 0 }],
    ['cjk-neg-slant', '成都', { face: 'serif', size: 16, slant: -0.22, align: 'center', jitter: 0 }],
    ['cjk-pos-slant', '成都', { face: 'serif', size: 16, slant: 0.22, align: 'center', jitter: 0 }],
    ['mixed-neg-slant', '成都 TOKYO', { face: 'serif', size: 14, slant: -0.22, align: 'center', jitter: 0 }],
  ];

  for (const [label, text, opts] of cases) {
    const S = blankSheet(200, 120, 5, `slant-${label}`);
    const mb = Lt.measureBox(text, { ...opts, x: 100, y: 60 });
    const wb = Lt.write(S, text, 100, 60, opts);
    assertValidBBox(mb, `mb:${label}`);
    assertValidBBox(wb, `wb:${label}`);

    // Actual inked pixels must stay within wb (allowing 1px rasterization tolerance)
    let minX = S.W, maxX = -1, minY = S.H, maxY = -1;
    for (let py = 0; py < S.H; py++) {
      for (let px = 0; px < S.W; px++) {
        if (S.fill[py * S.W + px] > 0) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }
    const tolMm = 1 / S.ppm + 0.05;
    assert.ok(minX / S.ppm >= wb.x0 - tolMm, `${label}: inkX0 (${minX / S.ppm}) >= wb.x0 (${wb.x0})`);
    assert.ok((maxX + 1) / S.ppm <= wb.x1 + tolMm, `${label}: inkX1 (${(maxX + 1) / S.ppm}) <= wb.x1 (${wb.x1})`);
    assert.ok(minY / S.ppm >= wb.y0 - tolMm, `${label}: inkY0 (${minY / S.ppm}) >= wb.y0 (${wb.y0})`);
    assert.ok((maxY + 1) / S.ppm <= wb.y1 + tolMm, `${label}: inkY1 (${(maxY + 1) / S.ppm}) <= wb.y1 (${wb.y1})`);

    // measureBox must closely match write() (< 0.5 mm on every edge)
    const maxDiff = Math.max(
      Math.abs(mb.x0 - wb.x0),
      Math.abs(mb.x1 - wb.x1),
      Math.abs(mb.y0 - wb.y0),
      Math.abs(mb.y1 - wb.y1),
    );
    assert.ok(maxDiff < 0.5, `${label}: measureBox vs write max diff (${maxDiff.toFixed(3)} mm) < 0.5 mm`);
  }

  // measureBox({ sub }) default face aligns with write({ sub }) / writeBilingual ('serif-bold')
  const Sb = blankSheet(120, 60, 5, 'sub-default-face');
  const mbSub = Lt.measureBox('成都', { x: 60, y: 25, size: 6, align: 'center', sub: 'Chengdu' });
  const wbSub = Lt.write(Sb, '成都', 60, 25, { size: 6, align: 'center', sub: 'Chengdu' });
  assert.ok(Math.abs(mbSub.w - wbSub.w) < 0.5, `measureBox({ sub }) width (${mbSub.w}) matches write (${wbSub.w})`);
  assert.ok(Math.abs(mbSub.h - wbSub.h) < 0.5, `measureBox({ sub }) height (${mbSub.h}) matches write (${wbSub.h})`);
});

test('Group 8: drawCartouche() long CJK title + flag leaves zero title ink in flag region at w=56 and w=66', () => {
  const title = '中华人民共和国四川省成都市';
  for (const w of [56, 66]) {
    const x = 10, y = 10, h = 46;
    const flagX0 = x + w - 20.5;
    const flagX1 = x + w - 7.5;

    // Render full cartouche and capture exact title draw arguments & bbox
    const map = createMap({ w: 120, h: 70, ppm: 6, ocean: false, border: false, seed: `cart-narrow-${w}` });
    let titleCall = null;
    const origText = map.P.text.bind(map.P);
    map.P.text = (txt, tx, ty, o) => {
      const bb = origText(txt, tx, ty, o);
      if (!titleCall && Math.abs(ty - (y + 12.2)) < 0.2) {
        titleCall = { txt, tx, ty, o, bb };
      }
      return bb;
    };
    map.cartouche(x, y, w, h, { country: title, flag: 'JP', lang: 'zh' });

    assert.ok(titleCall, `w=${w}: title was drawn`);
    assert.ok(
      titleCall.bb.x1 < flagX0,
      `w=${w}: title bbox right (${titleCall.bb.x1.toFixed(2)}) must stay left of flag (${flagX0})`,
    );

    // Independently verify pixel-level ink of the rendered title alone has 0 pixels inside [flagX0, flagX1]
    const St = blankSheet(120, 70, 6, `cart-title-ink-${w}`);
    Lt.write(St, titleCall.txt, titleCall.tx, titleCall.ty, titleCall.o);
    const flagStats = inkStatsInBox(St, { x0: flagX0, y0: y, x1: flagX1, y1: y + 18 });
    assert.equal(flagStats.insideCount, 0, `w=${w}: zero title ink pixels inside flag region [${flagX0}, ${flagX1}]`);
  }
});

test('Group 8: drawInsetBox() 18-char CJK title in narrow w=18 box stays strictly inside pill and box', () => {
  const x = 10, y = 10, w = 18, h = 18;
  const title = '中华人民共和国四川省成都市武侯区锦里';
  const map = createMap({ w: 60, h: 40, ppm: 6, ocean: false, border: false, seed: 'inset-narrow-18' });

  let titleCall = null;
  const origText = map.P.text.bind(map.P);
  map.P.text = (txt, tx, ty, o) => {
    const bb = origText(txt, tx, ty, o);
    titleCall = { txt, tx, ty, o, bb };
    return bb;
  };
  map.insetBox(x, y, w, h, title);

  const pillX0 = x + 2.5;
  const pillX1 = x + 2.5 + Math.max(4, w - 5);
  assert.ok(titleCall, 'inset title was drawn');
  assert.ok(titleCall.bb.x0 >= pillX0, `title x0 (${titleCall.bb.x0.toFixed(2)}) >= pillX0 (${pillX0})`);
  assert.ok(titleCall.bb.x1 <= pillX1, `title x1 (${titleCall.bb.x1.toFixed(2)}) <= pillX1 (${pillX1})`);
  assert.ok(titleCall.bb.x0 >= x && titleCall.bb.x1 <= x + w, 'title stays strictly inside inset box [x, x+w]');

  // Pixel-level check on isolated title sheet
  const St = blankSheet(60, 40, 6, 'inset-narrow-ink');
  Lt.write(St, titleCall.txt, titleCall.tx, titleCall.ty, titleCall.o);
  const stats = inkStatsInBox(St, { x0: pillX0, y0: y + 2.2, x1: pillX1, y1: y + 7.2 });
  assert.ok(stats.insideCount > 10, 'inset title rendered visible ink inside pill');
  assert.equal(stats.totalCount - stats.insideCount, 0, 'zero inset title ink pixels outside cream pill');
});

test('Group 8: whitespace-padded CJK/Latin strings agree tightly between measureBox and write under slant & rotation', () => {
  const texts = ['  成都  ', '  TOKYO  ', '   '];
  const slants = [0, 0.22, -0.22];
  const rotations = [0, 90];

  for (const text of texts) {
    for (const slant of slants) {
      for (const rotateDeg of rotations) {
        const opts = { face: 'sans', size: 12, slant, rotateDeg, jitter: 0 };
        const S = blankSheet(160, 160, 6, `ws-${slant}-${rotateDeg}`);
        const mb = Lt.measureBox(text, { ...opts, x: 80, y: 80 });
        const wb = Lt.write(S, text, 80, 80, opts);
        const allowEmpty = !/\S/.test(text);
        assertValidBBox(mb, `mb:${JSON.stringify(text)}:${slant}:${rotateDeg}`, { allowEmpty });
        assertValidBBox(wb, `wb:${JSON.stringify(text)}:${slant}:${rotateDeg}`, { allowEmpty });

        const maxDiff = Math.max(
          Math.abs(mb.x0 - wb.x0),
          Math.abs(mb.x1 - wb.x1),
          Math.abs(mb.y0 - wb.y0),
          Math.abs(mb.y1 - wb.y1),
        );
        assert.ok(
          maxDiff < 0.5,
          `${JSON.stringify(text)} slant=${slant} rot=${rotateDeg}: maxDiff=${maxDiff.toFixed(3)} mm >= 0.5 mm`,
        );
      }
    }
  }
});

test('Group 8: inline bilingual with secondarySpacing aligns accurately for right and center', () => {
  for (const align of ['right', 'center']) {
    const opts = {
      size: 8,
      layout: 'inline',
      align,
      secondarySpacing: 0.5,
      sub: 'CHENGDU',
      jitter: 0,
    };
    const S = blankSheet(200, 80, 6, `bi-secsp-${align}`);
    const anchorX = 120;
    const anchorY = 40;
    const mb = Lt.measureBox('成都', { ...opts, x: anchorX, y: anchorY });
    const wb = Lt.write(S, '成都', anchorX, anchorY, opts);
    assertValidBBox(mb, `mb-inline-${align}`);
    assertValidBBox(wb, `wb-inline-${align}`);

    const maxDiff = Math.max(
      Math.abs(mb.x0 - wb.x0),
      Math.abs(mb.x1 - wb.x1),
      Math.abs(mb.y0 - wb.y0),
      Math.abs(mb.y1 - wb.y1),
    );
    assert.ok(maxDiff < 0.5, `inline ${align}: measureBox vs write maxDiff=${maxDiff.toFixed(3)} mm`);

    if (align === 'right') {
      assert.ok(wb.x1 <= anchorX + 0.5, `inline right wb.x1 (${wb.x1.toFixed(3)}) must stay <= anchor (${anchorX})`);
      assert.ok(mb.x1 <= anchorX + 0.5, `inline right mb.x1 (${mb.x1.toFixed(3)}) must stay <= anchor (${anchorX})`);
    } else {
      const wbMid = (wb.x0 + wb.x1) / 2;
      assert.ok(Math.abs(wbMid - anchorX) < 0.5, `inline center midpoint (${wbMid.toFixed(3)}) ~ anchor (${anchorX})`);
    }
  }
});


