'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const EL = require('../src/elements');
const { POSES } = require('../engine/lib/people');
const {
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
} = require('../src/layout');

test('normalizeBBox enforces canonical mm invariants and handles negative extents', () => {
  const b = normalizeBBox(10, 20, 30, 15);
  assert.equal(b.x, 10);
  assert.equal(b.y, 20);
  assert.equal(b.w, 30);
  assert.equal(b.h, 15);
  assert.equal(b.x0, b.x);
  assert.equal(b.y0, b.y);
  assert.equal(b.x1, b.x + b.w);
  assert.equal(b.y1, b.y + b.h);

  const neg = normalizeBBox(50, 40, -10, -20);
  assert.deepEqual(neg, { x: 40, y: 20, w: 10, h: 20, x0: 40, y0: 20, x1: 50, y1: 40 });

  assert.throws(() => normalizeBBox(NaN, 0, 10, 10), TypeError);
});

test('bboxFromPoints and unionBBox produce valid canonical boxes', () => {
  const b = bboxFromPoints([[10, 20], [30, 5], [15, 25]], 1);
  assert.deepEqual(b, { x: 9, y: 4, w: 22, h: 22, x0: 9, y0: 4, x1: 31, y1: 26 });
  assert.equal(bboxFromPoints([]), null);

  const u = unionBBox(normalizeBBox(0, 0, 10, 10), normalizeBBox(5, 8, 15, 12));
  assert.deepEqual(u, { x: 0, y: 0, w: 20, h: 20, x0: 0, y0: 0, x1: 20, y1: 20 });
});

test('ELEMENT_BOUNDS covers all 43 built-in elements and PERSON_POSE_BOUNDS covers all 10 poses', () => {
  for (const name of Object.keys(EL)) {
    assert.ok(Array.isArray(ELEMENT_BOUNDS[name]), `Missing ELEMENT_BOUNDS for ${name}`);
    assert.equal(ELEMENT_BOUNDS[name].length, 4);
  }
  for (const pose of Object.keys(POSES)) {
    assert.ok(Array.isArray(PERSON_POSE_BOUNDS[pose]), `Missing PERSON_POSE_BOUNDS for ${pose}`);
  }

  // Hanbok defaults to scale 0.52 when scale is omitted
  const hb = estimateElementBox('hanbok', 100, 100);
  assert.ok(Math.abs(hb.h - 42.3 * 0.52) < 1e-6);

  // Rotation support for shinkansen
  const sh0 = estimateElementBox('shinkansen', 100, 100, 1, { angle: 0 });
  const sh90 = estimateElementBox('shinkansen', 100, 100, 1, { angle: Math.PI / 2 });
  assert.ok(sh0.w > sh0.h);
  assert.ok(sh90.h > sh90.w);

  // Person conical hat expands height and width
  const pPlain = estimateElementBox('person', 100, 100, 0.52, { pose: 'stand' });
  const pHat = estimateElementBox('person', 100, 100, 0.52, { pose: 'stand', hat: 'conical' });
  assert.ok(pHat.w > pPlain.w);
  assert.ok(pHat.h > pPlain.h);

  // Unknown element falls back cleanly
  const unk = estimateElementBox('futureLandmark', 50, 50, 1);
  assert.equal(unk.w, 16);
  assert.equal(unk.h, 12);
});

test('createLayout occupancy grid marks border, land polygons, and occupied cells', () => {
  const layout = createLayout({ w: 100, h: 80, inner: 8, gridStep: 2 });
  assert.equal(layout.CELL_BORDER, CELL_BORDER);
  assert.equal(layout.CELL_LAND, CELL_LAND);
  assert.equal(layout.CELL_OCCUPIED, CELL_OCCUPIED);
  assert.deepEqual(layout.safeFrame, [8, 8, 92, 72]);

  // Top-left corner cell (0,0) is in border
  assert.ok((layout.grid[0] & CELL_BORDER) !== 0);
  // Center cell is not in border
  const centerIdx = Math.floor(40 / 2) * layout.cols + Math.floor(50 / 2);
  assert.equal(layout.grid[centerIdx] & CELL_BORDER, 0);

  // Rasterize a land square [40..70, 20..60]
  layout.setLandPolygons([
    [[40, 20], [70, 20], [70, 60], [40, 60]],
    [[0, 0], [1, 1]], // degenerate ring ignored
  ]);
  assert.ok((layout.grid[centerIdx] & CELL_LAND) !== 0);
  // Left sea area [10..35, 20..60] is free sea
  assert.equal(layout.isFree(12, 20, 20, 20, { terrain: 'sea' }), true);
  assert.equal(layout.isFree(12, 20, 20, 20, { terrain: 'land' }), false);
  // Inside land square is free land, not sea
  assert.equal(layout.isFree(44, 24, 20, 20, { terrain: 'land' }), true);
  assert.equal(layout.isFree(44, 24, 20, 20, { terrain: 'sea' }), false);

  // Register an occupied box in the sea
  layout.register({ id: 'card', kind: 'cartouche', x: 12, y: 20, w: 20, h: 20 });
  assert.equal(layout.isFree(12, 20, 20, 20, { terrain: 'sea' }), false);
  // Border check in isFree
  assert.equal(layout.isFree(2, 2, 10, 10, { terrain: 'any' }), false);
});

test('overlaps, findOverlaps (with ownerId skipping & severity), and findOutOfBounds', () => {
  const a = normalizeBBox(10, 10, 20, 10);
  const b = normalizeBBox(25, 12, 20, 10);
  const ov = overlaps(a, b);
  assert.ok(ov);
  assert.equal(ov.areaMm2, 5 * 8);
  assert.equal(ov.dxMm, 5);
  assert.equal(ov.dyMm, 0);
  assert.equal(overlaps(a, normalizeBBox(30, 10, 10, 10)), null);

  const layout = createLayout({ w: 200, h: 120, inner: 8, gridStep: 2 });
  layout.register({ id: 'el1', kind: 'element', x: 50, y: 50, w: 16, h: 16 });
  // Linked label overlapping its own owner should NOT be reported
  layout.register({ id: 'el1:label', kind: 'label', x: 52, y: 60, w: 14, h: 4, meta: { ownerId: 'el1' } });
  // Unrelated label overlapping el1 SHOULD be reported
  layout.register({ id: 'lbl2', kind: 'label', x: 52, y: 52, w: 12, h: 5 });
  // Out-of-bounds item overflowing left & top
  layout.register({ id: 'oob1', kind: 'element', x: 4, y: 5, w: 10, h: 10 });

  const found = layout.findOverlaps();
  assert.equal(found.length, 1);
  assert.equal(found[0].a, 'el1');
  assert.equal(found[0].b, 'lbl2');
  assert.equal(found[0].severity, 'high');

  const oob = layout.findOutOfBounds();
  assert.equal(oob.length, 1);
  assert.equal(oob[0].id, 'oob1');
  assert.equal(oob[0].overflow.left, 4);
  assert.equal(oob[0].overflow.top, 3);
  assert.equal(oob[0].overflow.right, 0);
  assert.equal(oob[0].overflow.bottom, 0);
});

test('findEmptyRegions returns disjoint sea/land regions tagged by corner and toDiagnostics emits valid schema', () => {
  const layout = createLayout({ w: 300, h: 200, inner: 8, gridStep: 4 });
  // Central vertical land strip [110..190, 8..192] splits sea into left & right basins
  layout.setLandPolygons([[[110, 8], [190, 8], [190, 192], [110, 192]]]);
  layout.register({ id: 'cartouche', kind: 'cartouche', x: 16, y: 16, w: 70, h: 40 });

  const seaRegions = layout.findEmptyRegions({ terrain: 'sea', minW: 24, minH: 18, maxCount: 4 });
  assert.ok(seaRegions.length >= 2);
  // Sorted descending by areaMm2
  for (let i = 1; i < seaRegions.length; i++) {
    assert.ok(seaRegions[i - 1].areaMm2 >= seaRegions[i].areaMm2);
  }
  // All returned regions must be disjoint
  for (let i = 0; i < seaRegions.length; i++) {
    assert.ok(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(seaRegions[i].corner));
    for (let j = i + 1; j < seaRegions.length; j++) {
      assert.equal(overlaps(seaRegions[i], seaRegions[j]), null);
    }
  }

  const landRegions = layout.findEmptyRegions({ terrain: 'land', minW: 24, minH: 18, maxCount: 2 });
  assert.ok(landRegions.length >= 1);
  assert.equal(landRegions[0].terrain, 'land');

  const diag = layout.toDiagnostics({ ppm: 5, warnings: ['sample warning'] });
  assert.equal(diag.schemaVersion, 1);
  assert.deepEqual(diag.canvas, { w: 300, h: 200, ppm: 5, safeFrame: [8, 8, 292, 192] });
  assert.equal(diag.summary.totalItems, 1);
  assert.equal(diag.summary.overlapCount, 0);
  assert.equal(diag.summary.outOfBoundsCount, 0);
  assert.ok(diag.summary.landCoveragePct > 20 && diag.summary.landCoveragePct < 40);
  assert.ok(Math.abs(diag.summary.landCoveragePct + diag.summary.seaCoveragePct - 100) <= 0.2);
  assert.deepEqual(diag.warnings, ['sample warning']);
});
