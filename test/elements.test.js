'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMap, ELEMENT_BOUNDS, ELEMENT_META, elementBBox } = require('../src');
const EL = require('../src/elements');

const NEW_ELEMENTS = [
  // China / East Asia (7)
  'pavilion',
  'greatWall',
  'archBridge',
  'lantern',
  'panda',
  'dumplings',
  'teapot',
  // Europe (7)
  'cathedral',
  'europeanCastle',
  'windmill',
  'romanArch',
  'vineyard',
  'oliveTree',
  'cheeseWine',
  // Universal Nature / Marine / Transport (8)
  'palmTree',
  'volcano',
  'waterfall',
  'train',
  'ship',
  'hotAirBalloon',
  'fish',
  'yurt',
];

function assertValidBBox(b, label) {
  assert.equal(typeof b, 'object', `${label}: bbox must be an object`);
  for (const k of ['x', 'y', 'w', 'h', 'x0', 'y0', 'x1', 'y1']) {
    assert.ok(Number.isFinite(b[k]), `${label}.${k} must be finite (got ${b[k]})`);
  }
  assert.equal(b.x, b.x0, `${label}: x === x0`);
  assert.equal(b.y, b.y0, `${label}: y === y0`);
  assert.ok(Math.abs(b.x1 - (b.x + b.w)) < 1e-9, `${label}: x1 === x + w`);
  assert.ok(Math.abs(b.y1 - (b.y + b.h)) < 1e-9, `${label}: y1 === y + h`);
  assert.ok(b.w > 0 && b.h > 0, `${label}: w, h > 0`);
}

function countChangedPixels(S) {
  let changed = 0;
  for (let i = 0; i < S.rgb.length; i += 3) {
    const d =
      Math.abs(S.rgb[i] - S.paper0[i]) +
      Math.abs(S.rgb[i + 1] - S.paper0[i + 1]) +
      Math.abs(S.rgb[i + 2] - S.paper0[i + 2]);
    if (d > 12) changed++;
  }
  return changed;
}

test('src/elements.js exposes 65 drawable elements and keeps metadata non-enumerable', () => {
  const keys = Object.keys(EL);
  assert.equal(keys.length, 65, `expected 65 elements, got ${keys.length}`);
  assert.ok(!keys.includes('ELEMENT_BOUNDS'), 'ELEMENT_BOUNDS must be non-enumerable on src/elements');
  assert.ok(!keys.includes('ELEMENT_META'), 'ELEMENT_META must be non-enumerable on src/elements');
  assert.ok(!keys.includes('elementBBox'), 'elementBBox must be non-enumerable on src/elements');

  // Accessible via direct property access & src/index.js re-exports
  assert.equal(EL.ELEMENT_BOUNDS, ELEMENT_BOUNDS);
  assert.equal(EL.ELEMENT_META, ELEMENT_META);
  assert.equal(EL.elementBBox, elementBBox);

  // Every new element exists
  for (const name of NEW_ELEMENTS) {
    assert.equal(typeof EL[name], 'function', `missing new element ${name}`);
  }

  // 1-to-1 parity across EL, ELEMENT_BOUNDS, ELEMENT_META
  assert.deepEqual(Object.keys(ELEMENT_BOUNDS).sort(), keys.slice().sort());
  assert.deepEqual(Object.keys(ELEMENT_META).sort(), keys.slice().sort());
});

test('ELEMENT_META has valid category, region, anchor, rotatable, and tags for all 65 elements', () => {
  const validCategories = new Set(['nature', 'architecture', 'transport', 'animal', 'food', 'culture', 'marine']);
  const validRegions = new Set(['japan', 'korea', 'china', 'europe', 'world']);
  const validAnchors = new Set(['bottom-center', 'center']);

  for (const [name, meta] of Object.entries(ELEMENT_META)) {
    assert.ok(validCategories.has(meta.category), `${name}: invalid category ${meta.category}`);
    assert.ok(validRegions.has(meta.region), `${name}: invalid region ${meta.region}`);
    assert.ok(validAnchors.has(meta.anchor), `${name}: invalid anchor ${meta.anchor}`);
    assert.equal(typeof meta.rotatable, 'boolean', `${name}: rotatable must be boolean`);
    assert.ok(Array.isArray(meta.tags) && meta.tags.length > 0, `${name}: tags must be non-empty array`);
  }
});

test('elementBBox satisfies invariants, scaling, rotation AABB, hanbok defaultScale, and unknown error', () => {
  for (const name of Object.keys(EL)) {
    const b1 = elementBBox(name, 50, 60, 1);
    assertValidBBox(b1, `${name}@1`);
    const bHalf = elementBBox(name, 50, 60, 0.5);
    assertValidBBox(bHalf, `${name}@0.5`);
    assert.ok(Math.abs(bHalf.w - b1.w * 0.5) < 1e-6, `${name}: width scales linearly`);
    assert.ok(Math.abs(bHalf.h - b1.h * 0.5) < 1e-6, `${name}: height scales linearly`);
  }

  // Rotation AABB: rotating by PI/2 swaps width and height
  for (const name of ['shinkansen', 'koi', 'train', 'fish']) {
    const b0 = elementBBox(name, 50, 50, 1, 0);
    const b90 = elementBBox(name, 50, 50, 1, Math.PI / 2);
    assertValidBBox(b90, `${name}@90deg`);
    assert.ok(Math.abs(b90.w - b0.h) < 1e-6, `${name}: 90deg rotation swaps w/h`);
    assert.ok(Math.abs(b90.h - b0.w) < 1e-6, `${name}: 90deg rotation swaps h/w`);
  }

  // hanbok defaultScale = 0.52
  const hbDefault = elementBBox('hanbok', 50, 60);
  const hbExplicit = elementBBox('hanbok', 50, 60, 0.52);
  assert.deepEqual(hbDefault, hbExplicit);

  // Unknown element and Object.prototype property names throw cleanly
  assert.throws(() => elementBBox('nonExistentElement', 0, 0), /Unknown element/);
  assert.throws(() => elementBBox('toString', 10, 10), /Unknown element/);
  assert.throws(() => elementBBox('constructor', 10, 10), /Unknown element/);
  assert.throws(() => elementBBox('__proto__', 10, 10), /Unknown element/);
  assert.throws(() => elementBBox('hasOwnProperty', 10, 10), /Unknown element/);

  // Non-finite numeric parameters throw cleanly
  assert.throws(() => elementBBox('tree', 10, 10, NaN), RangeError);
  assert.throws(() => elementBBox('tree', 10, 10, Infinity), RangeError);
  assert.throws(() => elementBBox('tree', NaN, 10, 1), RangeError);
  assert.throws(() => elementBBox('tree', 10, 10, 1, Infinity), RangeError);
});

test('every one of the 65 element functions returns its matching unified BBox (and hanbok preserves hand/head/L)', () => {
  const map = createMap({ w: 80, h: 60, ppm: 3, ocean: false, border: false, seed: 'all-65-bbox' });
  for (const name of Object.keys(EL)) {
    const res = map.el[name](40, 45, 0.6);
    assertValidBBox(res, `el.${name}`);
    const expected = elementBBox(name, 40, 45, 0.6);
    assert.equal(res.x, expected.x, `el.${name}.x`);
    assert.equal(res.y, expected.y, `el.${name}.y`);
    assert.equal(res.w, expected.w, `el.${name}.w`);
    assert.equal(res.h, expected.h, `el.${name}.h`);
    assert.equal(res.x1, expected.x1, `el.${name}.x1`);
    assert.equal(res.y1, expected.y1, `el.${name}.y1`);
    if (name === 'hanbok') {
      assert.ok(res.hand && Array.isArray(res.hand.l) && Array.isArray(res.hand.r), 'hanbok preserves hand { l, r }');
      assert.ok(Array.isArray(res.head), 'hanbok preserves head');
      assert.equal(typeof res.L, 'function', 'hanbok preserves L');
    }
  }
});

test('all 22 new elements render visible non-blank pixels on canvas', () => {
  for (const name of NEW_ELEMENTS) {
    const map = createMap({ w: 45, h: 45, ppm: 3, ocean: false, border: false, seed: `el-${name}` });
    const isCenter = ELEMENT_META[name].anchor === 'center';
    const b = map.el[name](22, isCenter ? 22 : 34, 0.8);
    assertValidBBox(b, name);
    const changed = countChangedPixels(map.P.S);
    assert.ok(changed > 30, `new element ${name} should render visible pixels (got ${changed})`);
  }
});
