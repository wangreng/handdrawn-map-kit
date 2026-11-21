'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PALETTE, loadSpec, validateSpec, planSpec, renderSpec } = require('../src');

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('loadSpec parses JSON and YAML files and normalizes aliases without mutating input', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handdrawn-map-spec-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const yamlPath = path.join(dir, 'sample.yaml');
  fs.writeFileSync(yamlPath, [
    'schemaVersion: 1',
    'page:',
    '  w: 150',
    '  h: 100',
    '  ppm: 2',
    'region:',
    '  fit:',
    '    target: KOR',
    '  focus: [KOR]',
    'theme:',
    '  palette:',
    '    land: "#f0e0c0"',
  ].join('\n'));

  const fromYaml = loadSpec(yamlPath);
  assert.equal(fromYaml.canvas.w, 150);
  assert.equal(fromYaml.geo.fit.target, 'KOR');
  assert.equal(fromYaml.style.palette.land, '#f0e0c0');
  assert.equal(fromYaml.page, undefined);
  assert.equal(fromYaml.region, undefined);
  assert.equal(fromYaml.theme, undefined);

  const jsonPath = path.join(dir, 'sample.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ meta: { id: 'j1' }, canvas: { w: 120, h: 80, ppm: 2 } }));
  const fromJson = loadSpec(jsonPath);
  assert.equal(fromJson.meta.id, 'j1');

  const callerObj = { page: { w: 100, h: 80 }, region: { focus: ['JPN'] } };
  const cloned = loadSpec(callerObj);
  assert.ok(callerObj.page, 'caller object must not be mutated');
  assert.equal(cloned.canvas.w, 100);
});

test('validateSpec reports errors, warns on unknown top-level keys, and accepts PR 2/3/4/5 extension slots', () => {
  // Invalid cases
  const bad = validateSpec({
    schemaVersion: 99,
    canvas: { w: 1000, h: 1000, ppm: 5, paper: 'nonexistent' },
    geo: { fit: { target: 'NARNIA' }, focus: ['ATLANTIS'] },
    elements: [{ type: 'unknownThing', x: 50, y: 50 }],
    cartouche: { x: 10, y: 10, w: 60, h: 30, flag: 'INVALID_FLAG_CODE' },
    customUnknownKey: true,
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes('schemaVersion')));
  assert.ok(bad.errors.some((e) => e.includes('18.5 MP')));
  assert.ok(bad.errors.some((e) => e.includes('paper')));
  assert.ok(bad.errors.some((e) => e.includes('NARNIA')));
  assert.ok(bad.errors.some((e) => e.includes('ATLANTIS')));
  assert.ok(bad.errors.some((e) => e.includes('unknownThing')));
  assert.ok(bad.errors.some((e) => e.includes('cartouche.flag')));
  assert.ok(bad.warnings.some((w) => w.includes('customUnknownKey')));

  // Extension slots for PR 2, PR 3, PR 4, PR 5 must pass with ok: true
  const ext = validateSpec({
    schemaVersion: 1,
    meta: { id: 'sichuan', lang: 'zh' },
    canvas: { w: 300, h: 200, ppm: 5 },
    style: { font: 'ZCOOLXiaoWei' },
    geo: {
      fit: { target: { country: 'CHN', admin1: 'Sichuan' } },
      admin1: { show: true },
    },
    layers: {
      rivers: { auto: true, minScaleRank: 5 },
      lakes: { auto: true },
      mountains: { auto: true },
      cities: { auto: true, limit: 8 },
    },
    elements: [
      { id: 'svg1', type: 'svg', svg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', place: 'Chengdu' },
      { id: 'auto1', type: 'pagoda', placement: 'auto' },
    ],
    labels: [
      { id: 'lbl1', text: '四川省', subtext: 'Sichuan', x: 150, y: 100, angle: -12, lang: 'zh' },
      { id: 'lbl2', text: 'Yangtze', path: [[50, 100], [150, 110]] },
    ],
    cartouche: { placement: 'auto', w: 72, h: 42, title: 'SICHUAN' },
    compass: { placement: 'auto', r: 9 },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.5, gridStep: 2 },
  });
  assert.equal(ext.ok, true, `Expected extension slots to pass validation, got: ${ext.errors.join('; ')}`);
});

test('planSpec plans projection and layout diagnostics without rasterizing', () => {
  const plan = planSpec({
    meta: { id: 'kor-plan' },
    canvas: { w: 150, h: 100, ppm: 2 },
    geo: { fit: { target: 'KOR', margin: 6 }, focus: ['KOR'], neighbors: false },
    elements: [
      { id: 'gate', type: 'palaceGate', lon: 126.977, lat: 37.579, scale: 0.6 },
    ],
    labels: [
      { id: 'sea', kind: 'sea', text: 'EAST SEA', x: 120, y: 50 },
    ],
    cartouche: { x: 12, y: 12, w: 40, h: 24, title: 'KOREA', flag: 'KOR' },
  });
  assert.equal(plan.ok, true);
  assert.ok(plan.proj);
  assert.equal(plan.diagnostics.schemaVersion, 1);
  assert.equal(plan.diagnostics.summary.totalItems, 3);
  assert.ok(plan.diagnostics.summary.landCoveragePct > 0);
});

test('renderSpec renders valid PNG, is deterministic by seed, supports border:false, and never mutates PALETTE', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handdrawn-map-render-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const origLand = PALETTE.land;
  const spec = {
    meta: { id: 'mini-kor', seed: 'det-seed-42' },
    canvas: { w: 120, h: 80, ppm: 2 },
    style: { palette: { land: '#e5d5b0', ocean: '#bfd8e6' } },
    geo: {
      fit: { target: 'KOR', margin: 5 },
      focus: ['KOR'],
      neighbors: false,
      waterlines: true,
    },
    layers: {
      graticule: true,
      cities: [{ id: 'seoul', name: 'SEOUL', lon: 126.978, lat: 37.5665, capital: true }],
      waves: [{ x: 20, y: 60, scale: 0.8, count: 2 }],
    },
    elements: [
      { id: 'train', type: 'shinkansen', x: 60, y: 50, scale: 0.5, angle: 0.2 },
      { id: 'fish', type: 'koi', x: 95, y: 30, scale: 0.7, angle: -0.3 },
      { id: 'person1', type: 'person', x: 40, y: 55, scale: 0.4, options: { pose: 'wave' } },
    ],
    labels: [
      { id: 'sea', kind: 'sea', text: 'EAST SEA', x: 96, y: 45, size: 2.8 },
    ],
    compass: { x: 102, y: 64, r: 6, angle: 'auto' },
    cartouche: { x: 12, y: 12, w: 38, h: 22, title: 'KOREA', flag: 'KOR' },
  };

  const out1 = path.join(dir, 'run1.png');
  const out2 = path.join(dir, 'run2.png');
  const r1 = renderSpec(spec);
  await r1.save(out1);
  const r2 = renderSpec(spec);
  await r2.save(out2);

  assert.equal(PALETTE.land, origLand, 'global PALETTE must never be mutated');
  assert.deepEqual(pngSize(out1), { w: 240, h: 160 });
  assert.ok(fs.readFileSync(out1).equals(fs.readFileSync(out2)), 'identical seeds must produce byte-identical PNGs');
  assert.equal(r1.diagnostics.schemaVersion, 1);
  assert.ok(r1.diagnostics.summary.totalItems >= 6);

  // border: false expands safeFrame to full canvas
  const rNoBorder = renderSpec(spec, { border: false });
  assert.deepEqual(rNoBorder.diagnostics.canvas.safeFrame, [0, 0, 120, 80]);
  const out3 = path.join(dir, 'noborder.png');
  await rNoBorder.save(out3);
  assert.deepEqual(pngSize(out3), { w: 240, h: 160 });
});
