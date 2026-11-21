'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMap, drawSvg, parseSvg, parsePathD, measureSvg, PALETTE } = require('../src');

function assertValidBBox(b, label = 'bbox') {
  assert.equal(typeof b, 'object', `${label} should be an object`);
  for (const k of ['x', 'y', 'w', 'h', 'x0', 'y0', 'x1', 'y1']) {
    assert.ok(Number.isFinite(b[k]), `${label}.${k} must be finite (got ${b[k]})`);
  }
  assert.equal(b.x, b.x0, `${label}: x === x0`);
  assert.equal(b.y, b.y0, `${label}: y === y0`);
  assert.ok(Math.abs(b.x1 - (b.x + b.w)) < 1e-9, `${label}: x1 === x + w`);
  assert.ok(Math.abs(b.y1 - (b.y + b.h)) < 1e-9, `${label}: y1 === y + h`);
  assert.ok(b.w >= 0 && b.h >= 0, `${label}: w, h >= 0`);
}

function countChangedPixels(S, x0Mm, y0Mm, x1Mm, y1Mm) {
  const px0 = Math.max(0, Math.floor(x0Mm * S.ppm));
  const py0 = Math.max(0, Math.floor(y0Mm * S.ppm));
  const px1 = Math.min(S.W - 1, Math.ceil(x1Mm * S.ppm));
  const py1 = Math.min(S.H - 1, Math.ceil(y1Mm * S.ppm));
  let changed = 0;
  for (let py = py0; py <= py1; py++) {
    for (let px = px0; px <= px1; px++) {
      const i = (py * S.W + px) * 3;
      const dr = Math.abs(S.rgb[i] - S.paper0[i]);
      const dg = Math.abs(S.rgb[i + 1] - S.paper0[i + 1]);
      const db = Math.abs(S.rgb[i + 2] - S.paper0[i + 2]);
      if (dr + dg + db > 12) changed++;
    }
  }
  return changed;
}

function pixelDeltaAt(S, xMm, yMm) {
  const px = Math.round(xMm * S.ppm);
  const py = Math.round(yMm * S.ppm);
  const i = (py * S.W + px) * 3;
  return (
    Math.abs(S.rgb[i] - S.paper0[i]) +
    Math.abs(S.rgb[i + 1] - S.paper0[i + 1]) +
    Math.abs(S.rgb[i + 2] - S.paper0[i + 2])
  );
}

test('parsePathD handles M/m, L/l, H/h, V/v, Z/z and implicit repeated commands', () => {
  const subs = parsePathD('M 0 0 10 0 10 10 H 20 v 5 h -5 V 0 Z m 2 2 l 4 0 0 4 z');
  assert.equal(subs.length, 2);
  assert.equal(subs[0].closed, true);
  assert.deepEqual(subs[0].pts[0], [0, 0]);
  assert.deepEqual(subs[0].pts[1], [10, 0]);
  assert.deepEqual(subs[0].pts[2], [10, 10]);
  assert.deepEqual(subs[0].pts[3], [20, 10]);
  assert.deepEqual(subs[0].pts[4], [20, 15]);
  assert.deepEqual(subs[0].pts[5], [15, 15]);
  assert.deepEqual(subs[0].pts[6], [15, 0]);
  // Relative m after Z starts from previous subpath start (0, 0) -> (2, 2)
  assert.equal(subs[1].closed, true);
  assert.deepEqual(subs[1].pts[0], [2, 2]);
  assert.deepEqual(subs[1].pts[1], [6, 2]);
  assert.deepEqual(subs[1].pts[2], [6, 6]);
});

test('parsePathD handles consecutive numbers without spaces and scientific notation', () => {
  const subs = parsePathD('M10-5L.5.5l-1.5e-2+2.5e1');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].closed, false);
  assert.deepEqual(subs[0].pts[0], [10, -5]);
  assert.deepEqual(subs[0].pts[1], [0.5, 0.5]);
  assert.ok(Math.abs(subs[0].pts[2][0] - (0.5 - 0.015)) < 1e-9);
  assert.ok(Math.abs(subs[0].pts[2][1] - 25.5) < 1e-9);
});

test('parsePathD handles C/c, S/s, Q/q, T/t smooth control point reflection and reset', () => {
  const cubic = parsePathD('M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0');
  assert.equal(cubic.length, 1);
  assert.ok(cubic[0].pts.length > 6);
  const lastC = cubic[0].pts[cubic[0].pts.length - 1];
  assert.ok(Math.abs(lastC[0] - 20) < 1e-6 && Math.abs(lastC[1]) < 1e-6);

  // Smooth S after L should NOT reflect an old cubic control point
  const resetS = parsePathD('M 0 0 L 10 0 S 20 10 20 0');
  assert.equal(resetS.length, 1);
  const lastR = resetS[0].pts[resetS[0].pts.length - 1];
  assert.ok(Math.abs(lastR[0] - 20) < 1e-6 && Math.abs(lastR[1]) < 1e-6);

  // Quadratic Q + smooth T
  const quad = parsePathD('M 0 0 Q 5 10 10 0 T 20 0');
  assert.equal(quad.length, 1);
  assert.ok(quad[0].pts.length > 6);
  const lastQ = quad[0].pts[quad[0].pts.length - 1];
  assert.ok(Math.abs(lastQ[0] - 20) < 1e-6 && Math.abs(lastQ[1]) < 1e-6);
  // T should dip below y = 0 because control point reflects to (15, -10)
  const hasNegY = quad[0].pts.some(([, py]) => py < -1);
  assert.ok(hasNegY, 'T command should reflect previous Q control point');
});

test('parsePathD handles A/a elliptical arcs including compact flags and edge cases', () => {
  // Compact arc flags: 0110 -> largeArc=0, sweep=1, x=10
  const compact1 = parsePathD('M 0 0 a5 5 0 0110 10');
  assert.equal(compact1.length, 1);
  assert.ok(compact1[0].pts.length > 3);
  const end1 = compact1[0].pts[compact1[0].pts.length - 1];
  assert.ok(Math.abs(end1[0] - 10) < 1e-5 && Math.abs(end1[1] - 10) < 1e-5);

  // Compact arc flags: 1010,10 -> largeArc=1, sweep=0, x=10, y=10
  const compact2 = parsePathD('M 0 0 A5,5 0 1010,10');
  assert.equal(compact2.length, 1);
  const end2 = compact2[0].pts[compact2[0].pts.length - 1];
  assert.ok(Math.abs(end2[0] - 10) < 1e-5 && Math.abs(end2[1] - 10) < 1e-5);

  // rx=0 acts as straight line; start===end is a no-op
  const deg = parsePathD('M 0 0 A 0 5 0 0 1 10 0 A 5 5 0 0 1 10 0');
  assert.equal(deg.length, 1);
  assert.equal(deg[0].pts.length, 2);
  assert.deepEqual(deg[0].pts[1], [10, 0]);
});

test('parseSvg parses all basic shapes, ignores metadata/defs, and inherits transforms & styles', () => {
  const svg = `<?xml version="1.0"?>
    <!-- comment -->
    <svg viewBox="0 0 100 100" width="100px" height="100px">
      <defs><rect x="0" y="0" width="50" height="50"/></defs>
      <title>Test Icon</title>
      <desc>Description</desc>
      <metadata>Meta</metadata>
      <g fill="crimson" stroke="#222" stroke-width="2" transform="translate(10, 20) scale(2)">
        <circle cx="5" cy="5" r="4"/>
        <ellipse cx="15" cy="5" rx="4" ry="2" style="fill: rgb(10, 20, 30); stroke: none"/>
        <rect x="0" y="10" width="10" height="8" rx="3"/>
        <polygon points="0,0 10,0 5,8" transform="rotate(90, 5, 4)"/>
        <polyline points="0,0 4,4 8,0" fill="none"/>
        <line x1="0" y1="0" x2="10" y2="10" transform="skewX(15) skewY(5) matrix(1,0,0,1,2,3)"/>
      </g>
    </svg>`;
  const parsed = parseSvg(svg);
  assert.deepEqual(parsed.viewBox, [0, 0, 100, 100]);
  assert.equal(parsed.width, 100);
  assert.equal(parsed.height, 100);
  assert.equal(parsed.shapes.length, 6);

  // Inherited fill & stroke on circle
  assert.equal(parsed.shapes[0].fill, 'crimson');
  assert.equal(parsed.shapes[0].stroke, '#222');
  assert.equal(parsed.shapes[0].strokeWidth, 2);
  // Inline style overrides attributes on ellipse
  assert.equal(parsed.shapes[1].fill, 'rgb(10, 20, 30)');
  assert.equal(parsed.shapes[1].stroke, 'none');
  // Rounded rect has > 4 vertices
  assert.ok(parsed.shapes[2].subpaths[0].pts.length > 4);
  assert.equal(parsed.shapes[2].subpaths[0].closed, true);
  // Polyline & line are open
  assert.equal(parsed.shapes[4].subpaths[0].closed, false);
  assert.equal(parsed.shapes[5].subpaths[0].closed, false);
});

test('measureSvg and drawSvg return identical unified mm BBox across anchor, scale, rot, flip', () => {
  const svg = '<svg viewBox="0 0 20 10"><rect x="0" y="0" width="20" height="10" fill="#d9534f"/></svg>';

  // Aspect-ratio preservation with only w
  const bW = measureSvg(svg, 30, 25, { w: 10, anchor: 'bottom-center' });
  assertValidBBox(bW);
  assert.ok(Math.abs(bW.w - 10) < 1e-6);
  assert.ok(Math.abs(bW.h - 5) < 1e-6);
  assert.ok(Math.abs(bW.x - 25) < 1e-6);
  assert.ok(Math.abs(bW.y - 20) < 1e-6);

  // Center anchor
  const bCenter = measureSvg(svg, 30, 25, { h: 8, anchor: 'center' });
  assertValidBBox(bCenter);
  assert.ok(Math.abs(bCenter.w - 16) < 1e-6);
  assert.ok(Math.abs(bCenter.h - 8) < 1e-6);
  assert.ok(Math.abs(bCenter.x - 22) < 1e-6);
  assert.ok(Math.abs(bCenter.y - 21) < 1e-6);

  // Top-left anchor + 90-degree rotation swaps w and h
  const bRot = measureSvg(svg, 20, 20, { w: 10, anchor: 'top-left', rotDeg: 90 });
  assertValidBBox(bRot);
  assert.ok(Math.abs(bRot.w - 5) < 1e-6);
  assert.ok(Math.abs(bRot.h - 10) < 1e-6);

  // drawSvg matches measureSvg exactly
  const map = createMap({ w: 60, h: 40, ppm: 4, ocean: false, border: false, seed: 'svg-bbox' });
  const opts = { w: 12, anchor: 'center', rotDeg: 25, flipX: true, flipY: true };
  const measured = measureSvg(svg, 30, 20, opts);
  const drawn = drawSvg(map.P, svg, 30, 20, opts);
  assert.deepEqual(drawn, measured);
});

test('drawSvg renders visible pixels for pencil, wash, hatch, dashed strokes, and structured descriptors', () => {
  const svg = '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#c83030" stroke="#1d1a1e" stroke-width="1.2" stroke-dasharray="3,2,1"/></svg>';
  for (const fillStyle of ['pencil', 'wash', 'hatch']) {
    const map = createMap({ w: 40, h: 40, ppm: 4, ocean: false, border: false, seed: `style-${fillStyle}` });
    const b = map.svg(svg, 20, 20, { w: 16, anchor: 'center', fillStyle });
    assertValidBBox(b, fillStyle);
    const changed = countChangedPixels(map.P.S, b.x0, b.y0, b.x1, b.y1);
    assert.ok(changed > 40, `fillStyle=${fillStyle} should draw visible pixels (got ${changed})`);
  }

  // Structured { viewBox, shapes } descriptor
  const map2 = createMap({ w: 40, h: 40, ppm: 4, ocean: false, border: false, seed: 'descriptor' });
  const desc = {
    viewBox: [0, 0, 20, 20],
    shapes: [
      { d: 'M 2 18 L 10 2 L 18 18 Z', fill: 'vermilion', stroke: 'ink', strokeWidth: 1 },
      { type: 'line', x1: 2, y1: 19, x2: 18, y2: 19, stroke: PALETTE.navy, strokeWidth: 1, strokeDasharray: [2] },
    ],
  };
  const b2 = map2.svg(desc, 20, 30, { w: 16 });
  assertValidBBox(b2, 'descriptor');
  assert.ok(countChangedPixels(map2.P.S, b2.x0, b2.y0, b2.x1, b2.y1) > 40);
});

test('drawSvg preserves compound path holes in both pencil and wash fill styles', () => {
  // Donut: 40x40 outer square with 16x16 inner hole centered at (20, 20)
  const donut =
    '<svg viewBox="0 0 40 40"><path d="M 0 0 H 40 V 40 H 0 Z M 12 12 H 28 V 28 H 12 Z" fill="#c83030" stroke="none"/></svg>';

  for (const fillStyle of ['pencil', 'wash']) {
    const map = createMap({ w: 50, h: 50, ppm: 4, ocean: false, border: false, seed: `hole-${fillStyle}` });
    map.svg(donut, 25, 25, { w: 30, anchor: 'center', fillStyle, outline: false });
    // Center of donut is at (25, 25) -> must stay bare paper
    const centerDelta = pixelDeltaAt(map.P.S, 25, 25);
    assert.ok(centerDelta <= 8, `${fillStyle}: hole center should remain bare paper (delta=${centerDelta})`);
    // Ring body at (14, 25) (11 mm left of center, inside the ring) -> must be colored
    const ringChanged = countChangedPixels(map.P.S, 12, 22, 16, 28);
    assert.ok(ringChanged > 10, `${fillStyle}: ring body around hole should be painted (changed=${ringChanged})`);
  }
});

test('drawSvg and measureSvg handle empty/degenerate SVGs gracefully and render deterministically', () => {
  const map = createMap({ w: 40, h: 40, ppm: 4, ocean: false, border: false, seed: 'empty-test' });
  for (const input of [
    '',
    null,
    '<svg/>',
    '<svg viewBox="0 0 10 10"><path d=""/></svg>',
    '<svg><rect width="0" height="5"/><circle r="0"/><rect width="10" height="10" display="none"/></svg>',
    '<svg><path d="M 0 0 L 10 0" stroke="#000" stroke-dasharray="0,0"/></svg>',
  ]) {
    const b = map.svg(input, 15, 20, { w: 10 });
    assertValidBBox(b);
  }

  // Determinism check for identical seed
  const icon = '<svg viewBox="0 0 24 24"><path d="M 12 2 L 22 20 H 2 Z" fill="#d96b43" stroke="#1d1a1e"/></svg>';
  const m1 = createMap({ w: 40, h: 40, ppm: 4, ocean: false, border: false, seed: 'det-svg' });
  const m2 = createMap({ w: 40, h: 40, ppm: 4, ocean: false, border: false, seed: 'det-svg' });
  m1.svg(icon, 20, 30, { w: 16 });
  m2.svg(icon, 20, 30, { w: 16 });
  assert.deepEqual(Buffer.from(m1.P.S.rgb), Buffer.from(m2.P.S.rgb));
});
