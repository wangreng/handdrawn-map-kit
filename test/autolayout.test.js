'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createLayout, planSpec, renderSpec } = require('../src');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
  });
}

test('placeAuto prefers open sea and falls back cleanly to any free space on landlocked maps', () => {
  // Map with land occupying the right half [140..292]
  const seaLayout = createLayout({ w: 300, h: 200, inner: 8, gridStep: 2, padding: 1 });
  seaLayout.setLandPolygons([[[140, 8], [292, 8], [292, 192], [140, 192]]]);
  const seaPlaced = seaLayout.placeAuto({ w: 70, h: 36, terrain: 'sea', preferredCorners: ['top-left', 'bottom-left'] });
  assert.equal(seaPlaced.placed, true);
  assert.equal(seaPlaced.terrain, 'sea');
  assert.ok(seaPlaced.x + 70 <= 140.5, `Expected sea placement on left half, got x=${seaPlaced.x}`);

  // Completely landlocked map -> falls back to terrain: 'any' inside safeFrame
  const landLayout = createLayout({ w: 300, h: 200, inner: 8, gridStep: 2, padding: 1 });
  landLayout.setLandPolygons([[[0, 0], [300, 0], [300, 200], [0, 200]]]);
  landLayout.register({ id: 'center-el', kind: 'element', x: 120, y: 80, w: 40, h: 30, fixed: true });
  const fallbackPlaced = landLayout.placeAuto({ w: 70, h: 36, terrain: 'sea', fallbackAny: true });
  assert.equal(fallbackPlaced.placed, true);
  assert.equal(fallbackPlaced.terrain, 'any');
  assert.ok(fallbackPlaced.x >= 8 && fallbackPlaced.x + 70 <= 292);
  assert.ok(fallbackPlaced.y >= 8 && fallbackPlaced.y + 36 <= 192);
});

test('avoidOverlaps respects fixed items and descending priority, never drops or collapses boxes, and rebuilds grid', () => {
  const layout = createLayout({ w: 200, h: 140, inner: 8, gridStep: 2, padding: 1.5 });
  layout.register({ id: 'anchor', kind: 'label', x: 90, y: 60, w: 24, h: 8, priority: 100, fixed: true });
  for (let i = 1; i <= 5; i++) {
    layout.register({
      id: `lbl-${i}`,
      kind: 'label',
      x: 90 + (i % 2),
      y: 60 + (i % 2),
      w: 22,
      h: 7,
      priority: 60 - i * 5,
      fixed: false,
    });
  }

  assert.ok(layout.findOverlaps().length > 0, 'Expected initial overlaps');
  const res = layout.avoidOverlaps({ pad: 1.5, respectFixed: true });
  assert.equal(res.unresolved.length, 0, 'Expected all overlaps resolved');
  assert.equal(layout.findOverlaps().length, 0);
  assert.equal(layout.findOutOfBounds().length, 0);
  assert.equal(layout.items.length, 6, 'No items should be dropped');

  const anchor = layout.items.find((it) => it.id === 'anchor');
  assert.equal(anchor.x, 90);
  assert.equal(anchor.y, 60);

  for (let i = 1; i <= 5; i++) {
    const it = layout.items.find((item) => item.id === `lbl-${i}`);
    assert.equal(it.w, 22, 'Width must not collapse');
    assert.equal(it.h, 7, 'Height must not collapse');
  }

  // rebuildGrid synced occupied cells at new positions
  const moved1 = layout.items.find((it) => it.id === 'lbl-1');
  assert.equal(layout.isFree(moved1.x, moved1.y, moved1.w, moved1.h), false);
});

test('routeCallout picks a clean bend around occupied obstacles', () => {
  const layout = createLayout({ w: 200, h: 140, inner: 8, gridStep: 2, padding: 1 });
  layout.register({ id: 'blocker', kind: 'element', x: 90, y: 55, w: 20, h: 20, fixed: true });
  const targetBox = { x0: 130, y0: 60, x1: 150, y1: 70 };
  const route = layout.routeCallout([60, 65], targetBox);
  assert.deepEqual(route.from, [60, 65]);
  assert.equal(route.to[0], 130);
  assert.ok(Number.isFinite(route.bendX) && Number.isFinite(route.bendY));
  assert.notEqual(route.bendY, 65, 'Expected callout to bend around central blocker');
});

test('renderSpec wires PR 2 geo, PR 3 SVG array/string, PR 4 CJK/bilingual/curved, and M4b auto-layout', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handdrawn-map-m5-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const spec = {
    schemaVersion: 1,
    meta: { id: 'm5-integration', lang: 'zh', seed: 'm5-seed-1' },
    canvas: { w: 180, h: 120, ppm: 3 },
    geo: {
      fit: { target: { country: 'China', admin1: 'Sichuan' }, margin: 8 },
      focus: ['China'],
      admin1: { country: 'China', highlight: ['Sichuan'] },
    },
    layers: {
      rivers: { auto: true, maxRank: 6 },
      lakes: { auto: true },
      mountains: { auto: true, scale: 0.7 },
      cities: { auto: true, max: 3, bilingual: true },
      routes: [{ pts: [[104.06, 30.67], [106.55, 29.56]] }],
    },
    elements: [
      { id: 'p1', type: 'panda', place: 'Chengdu', scale: 0.7, priority: 60 },
      {
        id: 'svg-arr',
        type: 'svg',
        x: 90,
        y: 60,
        options: { width: 10, fillStyle: 'wash' },
        svg: [{ d: 'M0,0 L10,0 L5,10 Z', fill: '#c85a3a', stroke: '#2c241b' }],
        priority: 55,
      },
    ],
    labels: [
      { id: 'l-cd', text: '成都', subtext: 'Chengdu', lon: 104.06, lat: 30.67, size: 3.5, priority: 85 },
      { id: 'l-ang', kind: 'region', text: '四川盆地', x: 95, y: 60, size: 3.0, angle: -12, priority: 50 },
      { id: 'l-curve', kind: 'sea', text: '长江流域', path: [[40, 95], [90, 90], [140, 96]], size: 2.8, priority: 45 },
    ],
    compass: { placement: 'auto', r: 6 },
    cartouche: { placement: 'auto', w: 54, h: 30, country: '四川省', flag: 'CHN' },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.0 },
  };

  const plan = planSpec(spec);
  assert.equal(plan.ok, true, plan.errors.join('; '));
  assert.ok(plan.diagnostics.summary.landCoveragePct > 10);

  const res = renderSpec(spec);
  const outPng = path.join(dir, 'm5.png');
  await res.save(outPng);
  assert.ok(fs.existsSync(outPng));
  assert.equal(res.diagnostics.summary.overlapCount, 0, JSON.stringify(res.diagnostics.overlaps));
  assert.equal(res.diagnostics.summary.outOfBoundsCount, 0, JSON.stringify(res.diagnostics.outOfBounds));
  assert.ok(res.diagnostics.items.some((it) => it.id === 'svg-arr'));
  assert.ok(res.diagnostics.items.some((it) => it.id === 'cartouche'));
  assert.ok(res.diagnostics.items.some((it) => it.id === 'compass'));
});

test('CLI inspect admin1, places, rivers, and fonts return valid JSON', () => {
  const a1 = runCli(['inspect', 'admin1', 'China', '--json']);
  assert.equal(a1.status, 0, a1.stderr);
  const a1List = JSON.parse(a1.stdout);
  assert.ok(a1List.length >= 20);
  assert.ok(a1List.some((r) => /sichuan|四川/i.test(`${r.name} ${r.zh}`)));

  const pl = runCli(['inspect', 'places', 'China', '--json']);
  assert.equal(pl.status, 0, pl.stderr);
  const plList = JSON.parse(pl.stdout);
  assert.ok(plList.length >= 5);

  const rv = runCli(['inspect', 'rivers', 'Yangtze', '--json']);
  assert.equal(rv.status, 0, rv.stderr);
  const rvList = JSON.parse(rv.stdout);
  assert.ok(rvList.length >= 1);

  const fn = runCli(['inspect', 'fonts', '--json']);
  assert.equal(fn.status, 0, fn.stderr);
  const fnList = JSON.parse(fn.stdout);
  assert.ok(fnList.length >= 1);
});
