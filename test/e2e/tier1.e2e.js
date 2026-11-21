'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  withTempDir,
  runCli,
  parsePngIhdr,
  decodePngPixels,
  assertValidBBox,
  countInkInBBox,
  computePatchDiffRatio,
  writeSpecFile,
  assertDiagnosticsSchema,
  requireModule,
} = require('./helpers');

function extractList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const val of Object.values(parsed)) {
      if (Array.isArray(val)) return val;
    }
  }
  return null;
}

// ============================================================================
// Group 1: CLI (`inspect` & `render`) — 8 tests
// ============================================================================

test('T1-CLI-01: inspect countries --json returns countries including Japan, China, Italy', () => {
  const res = runCli(['inspect', 'countries', '--json']);
  assert.equal(res.status, 0, `CLI exited ${res.status}: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  const list = extractList(parsed);
  assert.ok(Array.isArray(list) && list.length >= 100, 'Expected >= 100 Natural Earth countries');
  const names = new Set(list.map((c) => (typeof c === 'string' ? c : c.name || c.id)));
  const ids = new Set(list.map((c) => (typeof c === 'string' ? c : c.id || c.iso2)));
  assert.ok(names.has('Japan') || ids.has('JPN'), 'Expected Japan/JPN in countries');
  assert.ok(names.has('China') || ids.has('CHN'), 'Expected China/CHN in countries');
  assert.ok(names.has('Italy') || ids.has('ITA'), 'Expected Italy/ITA in countries');
});

test('T1-CLI-02: inspect elements --json returns >= 60 elements including new China/Europe/world icons', () => {
  const res = runCli(['inspect', 'elements', '--json']);
  assert.equal(res.status, 0, `CLI exited ${res.status}: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  const list = extractList(parsed);
  assert.ok(Array.isArray(list) && list.length >= 60, `Expected >= 60 elements, got ${list && list.length}`);
  const names = new Set(list.map((e) => (typeof e === 'string' ? e : e.name || e.id)));
  for (const expected of ['torii', 'panda', 'pavilion', 'cathedral', 'windmill', 'volcano']) {
    assert.ok(names.has(expected), `Expected element "${expected}" in inspect elements`);
  }
});

test('T1-CLI-03: inspect flags --json returns built-in flags including JPN, CHN, ITA, FRA, DEU', () => {
  const res = runCli(['inspect', 'flags', '--json']);
  assert.equal(res.status, 0, `CLI exited ${res.status}: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  const list = extractList(parsed);
  assert.ok(Array.isArray(list) && list.length >= 30, 'Expected >= 30 built-in flags');
  const codes = new Set(list.map((f) => (typeof f === 'string' ? f : f.id || f.code || f.name)));
  for (const code of ['JPN', 'CHN', 'ITA', 'FRA', 'DEU']) {
    assert.ok(codes.has(code), `Expected flag "${code}" in inspect flags`);
  }
});

test('T1-CLI-04: inspect admin1 China --json returns Chinese provinces including Sichuan', () => {
  const res = runCli(['inspect', 'admin1', 'China', '--json']);
  assert.equal(res.status, 0, `CLI exited ${res.status}: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  const list = extractList(parsed);
  assert.ok(Array.isArray(list) && list.length >= 20, 'Expected >= 20 admin-1 divisions for China');
  const hasSichuan = list.some((a) => {
    const text = typeof a === 'string' ? a : JSON.stringify(a);
    return /sichuan|四川|CN-SC/i.test(text);
  });
  assert.ok(hasSichuan, 'Expected Sichuan / 四川 / CN-SC in inspect admin1 China');
});

test('T1-CLI-05: inspect places, rivers, and fonts --json return non-empty structured JSON lists', () => {
  for (const [sub, query] of [
    ['places', 'China'],
    ['rivers', 'Yangtze'],
    ['fonts', null],
  ]) {
    const args = query ? ['inspect', sub, query, '--json'] : ['inspect', sub, '--json'];
    const res = runCli(args);
    assert.equal(res.status, 0, `inspect ${sub} exited ${res.status}: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    const list = extractList(parsed);
    assert.ok(
      Array.isArray(list) && list.length >= 1,
      `inspect ${sub} should return a non-empty JSON list, got: ${JSON.stringify(parsed).slice(0, 200)}`
    );
  }
});

test('T1-CLI-06: inspect spec <file> --json validates a spec and outputs validation status', (t) => {
  const dir = withTempDir(t, 'e2e-cli-inspect-spec-');
  const specPath = writeSpecFile(dir, 'valid.json', {
    schemaVersion: 1,
    meta: { id: 'inspect-test', title: 'Italy', seed: 'inspect-1' },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'] },
  });
  const res = runCli(['inspect', 'spec', specPath, '--json']);
  assert.equal(res.status, 0, `inspect spec exited ${res.status}: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.ok, true, 'Expected inspect spec to report ok: true');
});

test('T1-CLI-07: render <spec.json> -o <out.png> --fast --diagnostics writes 1500x1000 PNG and valid diagnostics JSON', (t) => {
  const dir = withTempDir(t, 'e2e-cli-render-');
  const specPath = writeSpecFile(dir, 'japan.json', {
    schemaVersion: 1,
    meta: { id: 'cli-fast-japan', title: 'Japan', seed: 'cli-fast-1' },
    canvas: { w: 300, h: 200 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'], waterlines: true },
    cartouche: { x: 14, y: 14, w: 72, h: 36, country: 'JAPAN', flag: 'JPN' },
  });
  const outPng = path.join(dir, 'out.png');
  const outDiag = path.join(dir, 'diag.json');

  const res = runCli(['render', specPath, '-o', outPng, '--fast', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `CLI render exited ${res.status}: ${res.stderr}`);
  assert.ok(fs.existsSync(outPng), 'Expected output PNG to exist');
  assert.ok(fs.existsSync(outDiag), 'Expected diagnostics JSON to exist');

  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 1500, 'Expected --fast width 1500 (300mm * 5ppm)');
  assert.equal(ihdr.height, 1000, 'Expected --fast height 1000 (200mm * 5ppm)');

  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.equal(diag.canvas.ppm, 5);
  assert.ok(diag.items.length >= 1, 'Expected at least 1 tracked item in diagnostics');
});

test('T1-CLI-08: render honors --seed and --no-border CLI overrides', (t) => {
  const dir = withTempDir(t, 'e2e-cli-flags-');
  const specPath = writeSpecFile(dir, 'italy.json', {
    schemaVersion: 1,
    meta: { id: 'cli-flags', title: 'Italy', seed: 'base-seed' },
    canvas: { w: 180, h: 120 },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'] },
  });
  const outA = path.join(dir, 'a.png');
  const outB = path.join(dir, 'b.png');

  const resA = runCli(['render', specPath, '-o', outA, '--ppm', '4', '--seed', 'override-seed', '--no-border']);
  assert.equal(resA.status, 0, `First render failed: ${resA.stderr}`);
  const resB = runCli(['render', specPath, '-o', outB, '--ppm', '4', '--seed', 'override-seed', '--no-border']);
  assert.equal(resB.status, 0, `Second render failed: ${resB.stderr}`);

  const ihdr = parsePngIhdr(outA);
  assert.equal(ihdr.width, 720);
  assert.equal(ihdr.height, 480);
  assert.ok(fs.readFileSync(outA).equals(fs.readFileSync(outB)), 'Identical --seed must produce identical PNG bytes');
});

// ============================================================================
// Group 2: Spec Loading & Basic Layers — 6 tests
// ============================================================================

test('T1-SPEC-01: loadSpec and validateSpec accept JSON spec with schemaVersion 1', (t) => {
  const { loadSpec, validateSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-spec-json-');
  const specPath = writeSpecFile(dir, 'spec.json', {
    schemaVersion: 1,
    meta: { id: 'spec-json', title: 'France', seed: 'fr-1' },
    canvas: { w: 200, h: 140, ppm: 4 },
    geo: { fit: { target: 'France' }, focus: ['France'] },
  });
  const loaded = loadSpec(specPath);
  const res = validateSpec(loaded);
  assert.equal(res.ok, true, `Expected valid spec, got errors: ${JSON.stringify(res.errors)}`);
  assert.equal(res.errors.length, 0);
  assert.equal(res.spec.schemaVersion, 1);
});

test('T1-SPEC-02: loadSpec accepts YAML spec and normalizes aliases (page, region, theme)', (t) => {
  const { loadSpec, validateSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-spec-yaml-');
  const yamlText = [
    'schemaVersion: 1',
    'meta:',
    '  id: yaml-alias-test',
    '  title: Korea',
    '  seed: kr-1',
    'page:',
    '  w: 220',
    '  h: 150',
    '  ppm: 4',
    'region:',
    '  fit:',
    '    target: South Korea',
    '  focus:',
    '    - South Korea',
    'theme:',
    '  palette:',
    '    ocean: "#c8dce4"',
  ].join('\n');
  const yamlPath = writeSpecFile(dir, 'korea.yaml', yamlText);
  const loaded = loadSpec(yamlPath);
  const res = validateSpec(loaded);
  assert.equal(res.ok, true, `YAML spec failed validation: ${JSON.stringify(res.errors)}`);
  assert.equal(res.spec.canvas.w, 220);
  assert.equal(res.spec.canvas.h, 150);
  assert.ok(res.spec.geo && res.spec.geo.fit, 'Expected region alias normalized to geo');
  assert.ok(res.spec.style && res.spec.style.palette, 'Expected theme alias normalized to style');
});

test('T1-SPEC-03: renderSpec renders basic layers (graticule, waterlines, focus, neighbors, routes, waves, riceFields)', async (t) => {
  const { renderSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-spec-layers-');
  const outPng = path.join(dir, 'layers.png');

  const result = await renderSpec({
    schemaVersion: 1,
    meta: { id: 'basic-layers', seed: 'layers-1' },
    canvas: { w: 200, h: 140, ppm: 4 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'], waterlines: true },
    layers: {
      graticule: true,
      routes: [{ pts: [[135.5, 34.7], [139.7, 35.7]] }],
      waves: [{ x: 30, y: 110, scale: 1, count: 2 }],
      riceFields: [{ x: 100, y: 80, w: 12, h: 6 }],
    },
  });
  await result.save(outPng);
  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 800);
  assert.equal(ihdr.height, 560);
  assertDiagnosticsSchema(result.diagnostics);
});

test('T1-SPEC-04: renderSpec renders cartouche, compass, insets, and callouts with tracked diagnostics items', async (t) => {
  const { renderSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-spec-ornaments-');
  const outPng = path.join(dir, 'ornaments.png');

  const result = await renderSpec({
    schemaVersion: 1,
    meta: { id: 'ornaments', seed: 'orn-1' },
    canvas: { w: 240, h: 160, ppm: 4 },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'] },
    cartouche: { x: 12, y: 12, w: 68, h: 34, country: 'ITALY', flag: 'ITA' },
    compass: { x: 210, y: 132, r: 8 },
    insets: [{ id: 'inset-sicily', x: 168, y: 14, w: 54, h: 36, title: 'SICILY' }],
    callouts: [{ from: [120, 80], to: [145, 70] }],
    labels: [{ id: 'lbl-rome', text: 'Rome', x: 150, y: 70 }],
  });
  await result.save(outPng);
  assertDiagnosticsSchema(result.diagnostics);
  assert.ok(result.diagnostics.items.length >= 3, 'Expected cartouche, compass, inset/label tracked in diagnostics');
  const img = await decodePngPixels(outPng);
  const ink = countInkInBBox(img, { x: 12, y: 12, w: 68, h: 34 }, 4);
  assert.ok(ink.darkInkCount > 80, 'Expected visible dark ink inside cartouche bbox');
});

test('T1-SPEC-05: renderSpec supports extension slots (admin1, auto geo layers, svg element, bilingual subtext)', async (t) => {
  const { renderSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-spec-ext-');
  const outPng = path.join(dir, 'ext.png');

  const result = await renderSpec({
    schemaVersion: 1,
    meta: { id: 'ext-slots', lang: 'zh', seed: 'ext-1' },
    canvas: { w: 220, h: 150, ppm: 4 },
    geo: {
      fit: { target: { country: 'China', admin1: 'Sichuan' } },
      focus: ['China'],
      admin1: { country: 'China', highlight: ['Sichuan'] },
    },
    layers: {
      rivers: { auto: true },
      lakes: { auto: true },
      cities: { auto: true, max: 5 },
      mountains: { auto: true },
    },
    elements: [
      {
        id: 'svg-star',
        type: 'svg',
        x: 110,
        y: 75,
        scale: 1,
        svg: '<svg viewBox="0 0 20 20"><polygon points="10,1 13,7 19,8 14,12 16,19 10,15 4,19 6,12 1,8 7,7" fill="#c84a32" stroke="#1d1a1e"/></svg>',
      },
    ],
    labels: [
      { id: 'chengdu-bi', text: '成都', subtext: 'Chengdu', lon: 104.06, lat: 30.67, size: 3.2 },
    ],
  });
  await result.save(outPng);
  assertDiagnosticsSchema(result.diagnostics);
  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 880);
  assert.equal(ihdr.height, 600);
});

test('T1-SPEC-06: renderSpec honors ppm and seed overrides with deterministic PNG bytes', async (t) => {
  const { renderSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-spec-det-');
  const spec = {
    schemaVersion: 1,
    meta: { id: 'det-test', seed: 'initial' },
    canvas: { w: 160, h: 100, ppm: 4 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'] },
  };
  const out1 = path.join(dir, 'run1.png');
  const out2 = path.join(dir, 'run2.png');

  const r1 = await renderSpec(spec, { seed: 'fixed-seed-42', ppm: 4 });
  await r1.save(out1);
  const r2 = await renderSpec(spec, { seed: 'fixed-seed-42', ppm: 4 });
  await r2.save(out2);

  assert.ok(fs.readFileSync(out1).equals(fs.readFileSync(out2)), 'Same seed must render byte-identical PNG');
});

// ============================================================================
// Group 3: Built-In Elements & Metadata — 5 tests
// ============================================================================

test('T1-EL-01: new China elements render visible ink inside returned BBox', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const dir = withTempDir(t, 'e2e-el-china-');
  const outPng = path.join(dir, 'china-el.png');
  const ppm = 5;
  const map = createMap({ w: 220, h: 60, ppm, seed: 'el-china', ocean: false, border: false });

  const chinaNames = ['pavilion', 'greatWall', 'archBridge', 'lantern', 'panda', 'dumplings', 'teapot'];
  const boxes = [];
  chinaNames.forEach((name, idx) => {
    assert.equal(typeof map.el[name], 'function', `Expected map.el.${name} to be a function`);
    const cx = 20 + idx * 30;
    const by = 45;
    const bbox = map.el[name](cx, by, 1.1);
    assertValidBBox(bbox, `map.el.${name}`);
    assert.ok(bbox.w > 1 && bbox.h > 1, `${name}: expected non-degenerate bbox`);
    boxes.push({ name, bbox });
  });

  await map.save(outPng);
  const img = await decodePngPixels(outPng);
  for (const { name, bbox } of boxes) {
    const ink = countInkInBBox(img, bbox, ppm, { padMm: 1 });
    assert.ok(ink.nonBgCount > 15, `${name}: expected visible ink inside returned bbox`);
  }
});

test('T1-EL-02: new Europe and world elements render visible ink inside returned BBox', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const dir = withTempDir(t, 'e2e-el-world-');
  const outPng = path.join(dir, 'world-el.png');
  const ppm = 4;
  const map = createMap({ w: 260, h: 120, ppm, seed: 'el-world', ocean: false, border: false });

  const names = [
    'cathedral', 'europeanCastle', 'windmill', 'romanArch', 'vineyard',
    'oliveTree', 'cheeseWine', 'palmTree', 'volcano', 'waterfall',
    'train', 'ship', 'hotAirBalloon', 'fish', 'yurt',
  ];
  const boxes = [];
  names.forEach((name, idx) => {
    assert.equal(typeof map.el[name], 'function', `Expected map.el.${name} to be a function`);
    const col = idx % 5;
    const row = Math.floor(idx / 5);
    const cx = 26 + col * 50;
    const by = 34 + row * 38;
    const bbox = map.el[name](cx, by, 1.0);
    assertValidBBox(bbox, `map.el.${name}`);
    boxes.push({ name, bbox });
  });

  await map.save(outPng);
  const img = await decodePngPixels(outPng);
  for (const { name, bbox } of boxes) {
    const ink = countInkInBBox(img, bbox, ppm, { padMm: 1 });
    assert.ok(ink.nonBgCount > 10, `${name}: expected visible ink inside returned bbox`);
  }
});

test('T1-EL-03: ELEMENT_BOUNDS and ELEMENT_META cover all built-in elements', () => {
  const elements = requireModule('src/elements.js');
  assert.ok(elements.ELEMENT_BOUNDS && typeof elements.ELEMENT_BOUNDS === 'object', 'ELEMENT_BOUNDS missing');
  assert.ok(elements.ELEMENT_META && typeof elements.ELEMENT_META === 'object', 'ELEMENT_META missing');

  const fnNames = Object.keys(elements).filter(
    (k) => typeof elements[k] === 'function' && k !== 'elementBBox'
  );
  assert.ok(fnNames.length >= 60, `Expected >= 60 element functions, found ${fnNames.length}`);
  for (const name of fnNames) {
    assert.ok(elements.ELEMENT_BOUNDS[name], `Missing ELEMENT_BOUNDS entry for ${name}`);
    assert.ok(elements.ELEMENT_META[name], `Missing ELEMENT_META entry for ${name}`);
  }
});

test('T1-EL-04: elementBBox returns canonical BBox matching rendered element BBox', () => {
  const { createMap } = requireModule('src/index.js');
  const { elementBBox } = requireModule('src/elements.js');
  const map = createMap({ w: 120, h: 80, ppm: 4, seed: 'el-bbox', ocean: false, border: false });

  for (const name of ['torii', 'panda', 'cathedral', 'whale', 'shinkansen']) {
    const predicted = elementBBox(name, 60, 40, 1.2, 0);
    assertValidBBox(predicted, `elementBBox(${name})`);
    const rendered = map.el[name](60, 40, 1.2);
    assertValidBBox(rendered, `rendered(${name})`);
    assert.ok(Math.abs(predicted.x - rendered.x) < 1e-3, `${name}: x mismatch`);
    assert.ok(Math.abs(predicted.y - rendered.y) < 1e-3, `${name}: y mismatch`);
    assert.ok(Math.abs(predicted.w - rendered.w) < 1e-3, `${name}: w mismatch`);
    assert.ok(Math.abs(predicted.h - rendered.h) < 1e-3, `${name}: h mismatch`);
  }
});

test('T1-EL-05: baseline 43 elements remain exported and return valid BBox', () => {
  const { createMap } = requireModule('src/index.js');
  const map = createMap({ w: 160, h: 100, ppm: 4, seed: 'el-base', ocean: false, border: false });
  const baselineSample = [
    'tree', 'sakura', 'pine', 'bamboo', 'mountain', 'onsen', 'torii', 'pagoda',
    'castle', 'tokyoTower', 'house', 'lighthouse', 'shinkansen', 'sailboat',
    'whale', 'shibaInu', 'deer', 'crane', 'koi', 'foodBowl', 'sushi', 'onigiri',
    'dango', 'matcha', 'daruma', 'koinobori', 'origamiCrane', 'sumoRing',
    'palaceGate', 'hillTower', 'hanok', 'onggi', 'bibimbap', 'gimbap',
    'dolHareubang', 'mugunghwa', 'turtleShip', 'stoneObservatory', 'tiger',
    'crab', 'tangerine', 'hahoeMask', 'hanbok',
  ];
  assert.equal(baselineSample.length, 43);
  for (const name of baselineSample) {
    assert.equal(typeof map.el[name], 'function', `Baseline element ${name} missing`);
    const bbox = map.el[name](80, 50, 0.8);
    assertValidBBox(bbox, `baseline.${name}`);
  }
});

// ============================================================================
// Group 4: Inline SVG Dry-Media Renderer — 5 tests
// ============================================================================

test('T1-SVG-01: parsePathD parses all SVG path commands (M/L/H/V/C/S/Q/T/A/Z)', () => {
  const { parsePathD } = requireModule('src/svgDraw.js');
  const d = 'M 0 0 L 10 0 l 0 10 H 20 h 5 V 20 v 5 C 25 30 15 30 10 25 S 0 20 5 15 Q 10 10 15 15 T 20 10 A 5 5 0 0 1 10 5 a 4 4 0 1 0 -5 0 Z';
  const parsed = parsePathD(d);
  assert.ok(Array.isArray(parsed) && parsed.length >= 1, 'Expected at least 1 parsed subpath');
  const first = parsed[0];
  const pts = Array.isArray(first) ? first : first.pts || first.points;
  assert.ok(Array.isArray(pts) && pts.length >= 8, 'Expected sampled points along complex path');
  for (const pt of pts) {
    assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]), 'All parsed path points must be finite');
  }
});

test('T1-SVG-02: parseSvg parses basic shapes with <g transform> and inherited styles', () => {
  const { parseSvg } = requireModule('src/svgDraw.js');
  const svg = [
    '<svg viewBox="0 0 100 100">',
    '  <g transform="translate(10, 5) scale(1.5)" fill="#c84a32" stroke="#1d1a1e">',
    '    <rect x="2" y="2" width="12" height="8" rx="2"/>',
    '    <circle cx="25" cy="10" r="6"/>',
    '    <ellipse cx="40" cy="10" rx="8" ry="4"/>',
    '    <polygon points="5,25 15,20 20,30"/>',
    '    <polyline points="25,25 35,20 45,30" fill="none"/>',
    '    <line x1="0" y1="35" x2="40" y2="35"/>',
    '  </g>',
    '</svg>',
  ].join('\n');
  const doc = parseSvg(svg);
  assert.ok(doc && typeof doc === 'object', 'parseSvg should return parsed object');
  const shapes = Array.isArray(doc) ? doc : doc.shapes || doc.paths || doc.elements;
  assert.ok(Array.isArray(shapes) && shapes.length === 6, `Expected 6 shapes, got ${shapes && shapes.length}`);
});

test('T1-SVG-03: measureSvg returns pure canonical BBox without rendering', () => {
  const { measureSvg } = requireModule('src/svgDraw.js');
  const svg = '<svg viewBox="0 0 40 20"><rect x="0" y="0" width="40" height="20" fill="#88a"/></svg>';
  const bbox = measureSvg(svg, 50, 40, { width: 20 });
  assertValidBBox(bbox, 'measureSvg');
  assert.ok(bbox.w > 15 && bbox.w < 25, `Expected width ~20mm, got ${bbox.w}`);
  assert.ok(bbox.h > 7 && bbox.h < 13, `Expected height ~10mm, got ${bbox.h}`);
});

test('T1-SVG-04: drawSvg renders pencil, wash, and hatch fill styles with ink inside returned BBox', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const { drawSvg } = requireModule('src/svgDraw.js');
  const dir = withTempDir(t, 'e2e-svg-styles-');
  const outPng = path.join(dir, 'svg-styles.png');
  const ppm = 5;
  const map = createMap({ w: 140, h: 60, ppm, seed: 'svg-styles', ocean: false, border: false });

  const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#c85a3a" stroke="#1d1a1e" stroke-width="1.2"/></svg>';
  const styles = ['pencil', 'wash', 'hatch'];
  const boxes = styles.map((fillStyle, i) => {
    const bbox = drawSvg(map.P, svg, 28 + i * 42, 30, { width: 18, fillStyle });
    assertValidBBox(bbox, `drawSvg(${fillStyle})`);
    return { fillStyle, bbox };
  });

  await map.save(outPng);
  const img = await decodePngPixels(outPng);
  for (const { fillStyle, bbox } of boxes) {
    const ink = countInkInBBox(img, bbox, ppm, { padMm: 1 });
    assert.ok(ink.nonBgCount > 50, `drawSvg(${fillStyle}): expected rendered ink in bbox`);
  }
});

test('T1-SVG-05: inline SVG in declarative Spec renders ink inside its diagnostics bbox', async (t) => {
  const { renderSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-svg-spec-');
  const outPng = path.join(dir, 'svg-spec.png');
  const ppm = 4;

  const result = await renderSpec({
    schemaVersion: 1,
    meta: { id: 'svg-in-spec', seed: 'svg-spec-1' },
    canvas: { w: 160, h: 100, ppm },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'] },
    elements: [
      {
        id: 'custom-badge',
        type: 'svg',
        x: 40,
        y: 50,
        options: { width: 18, fillStyle: 'pencil' },
        svg: '<svg viewBox="0 0 20 20"><path d="M10 1 L19 10 L10 19 L1 10 Z" fill="#b83b28" stroke="#191512"/></svg>',
      },
    ],
  });
  await result.save(outPng);
  assertDiagnosticsSchema(result.diagnostics);
  const item = result.diagnostics.items.find((it) => it.id === 'custom-badge');
  assert.ok(item, 'Expected custom-badge in diagnostics items');
  assertValidBBox(item, 'custom-badge');

  const img = await decodePngPixels(outPng);
  const ink = countInkInBBox(img, item, ppm, { padMm: 1 });
  assert.ok(ink.nonBgCount > 30, 'Expected visible ink inside custom-badge diagnostics bbox');
});

// ============================================================================
// Group 5: Natural Earth Multi-Layer Geo APIs — 6 tests
// ============================================================================

test('T1-GEO-01: getAdmin1 / findAdmin1 / listAdmin1 resolves Sichuan by English, Chinese, and ISO-3166-2', () => {
  const geo = requireModule('src/geo.js');
  const byEn = geo.getAdmin1('Sichuan', { country: 'China' });
  const byZh = geo.findAdmin1('四川', { country: 'China' });
  const byIso = geo.findAdmin1('CN-SC', { country: 'China' });

  assert.ok(byEn && Array.isArray(byEn.polygons) && byEn.polygons.length > 0, 'Expected Sichuan polygons by English');
  assert.ok(byZh && Array.isArray(byZh.polygons) && byZh.polygons.length > 0, 'Expected Sichuan polygons by 四川');
  assert.ok(byIso && Array.isArray(byIso.polygons) && byIso.polygons.length > 0, 'Expected Sichuan polygons by CN-SC');

  const list = geo.listAdmin1('China');
  assert.ok(Array.isArray(list) && list.length >= 25, 'Expected >= 25 provinces/municipalities for China');
});

test('T1-GEO-02: admin1InBBox and resolveRegion return valid polygons and bboxes', () => {
  const geo = requireModule('src/geo.js');
  const resolved = geo.resolveRegion({ country: 'China', admin1: 'Sichuan' });
  assert.ok(resolved && Array.isArray(resolved.polygons) && resolved.polygons.length > 0);
  const bbox = resolved.mainBBox || resolved.bbox;
  assert.ok(Array.isArray(bbox) && bbox.length === 4, 'Expected 4-element geographic bbox');
  assert.ok(bbox[0] < bbox[2] && bbox[1] < bbox[3], 'Expected valid [west, south, east, north]');

  const inBox = geo.admin1InBBox(bbox, { country: 'China' });
  assert.ok(Array.isArray(inBox) && inBox.length >= 1, 'Expected at least Sichuan in its own bbox');
});

test('T1-GEO-03: riversInBBox / findRiver / getRiver locates major rivers (Yangtze, Po, Rhine)', () => {
  const geo = requireModule('src/geo.js');
  const yangtze = geo.findRiver('Yangtze') || geo.findRiver('Chang Jiang');
  assert.ok(yangtze, 'Expected Yangtze / Chang Jiang river in dataset');
  assert.equal(typeof geo.getRiver, 'function', 'Expected geo.getRiver to be exported');
  const fetched = geo.getRiver(yangtze.name || yangtze.id || 'Yangtze');
  assert.ok(fetched, 'Expected geo.getRiver to return river feature');
  assert.ok(
    (Array.isArray(fetched.lines) && fetched.lines.length >= 1) ||
      (Array.isArray(fetched.coords) && fetched.coords.length >= 1) ||
      (Array.isArray(fetched.paths) && fetched.paths.length >= 1),
    'Expected river feature from getRiver to include geometry coordinates/lines'
  );

  const cnRivers = geo.riversInBBox([97, 26, 112, 35]);
  assert.ok(Array.isArray(cnRivers) && cnRivers.length >= 1, 'Expected rivers in Sichuan/Yangtze bbox');

  const itRivers = geo.riversInBBox([6, 36, 19, 47]);
  assert.ok(Array.isArray(itRivers) && itRivers.length >= 1, 'Expected rivers in Italy bbox');
});

test('T1-GEO-04: lakesInBBox / findLake / getLake returns lake polygons with valid bboxes', () => {
  const geo = requireModule('src/geo.js');
  const lakes = geo.lakesInBBox([70, 20, 145, 50]);
  assert.ok(Array.isArray(lakes) && lakes.length >= 1, 'Expected lakes in East Asia bbox');
  const first = lakes[0];
  assert.ok(Array.isArray(first.polygons) && first.polygons.length >= 1, 'Lake should have polygons');
  assert.ok(Array.isArray(first.bbox) && first.bbox.length === 4, 'Lake should have bbox');
});

test('T1-GEO-05: placesInBBox / findPlace / getPlace returns cities with CJK names and capitals prioritized', () => {
  const geo = requireModule('src/geo.js');
  const places = geo.placesInBBox([97, 26, 110, 35]);
  assert.ok(Array.isArray(places) && places.length >= 2, 'Expected multiple populated places in Sichuan bbox');

  const chengdu = geo.findPlace('Chengdu') || geo.findPlace('成都');
  assert.ok(chengdu, 'Expected Chengdu in populated places');
  assert.ok(Number.isFinite(chengdu.lon) && Number.isFinite(chengdu.lat), 'Place must have finite lon/lat');

  const italyPlaces = geo.placesInBBox([6, 36, 19, 47]);
  assert.ok(italyPlaces.length >= 3, 'Expected multiple cities in Italy');
  const romeIdx = italyPlaces.findIndex((p) => /rome|roma/i.test(p.name));
  assert.ok(romeIdx >= 0 && romeIdx <= 5, 'Expected capital Rome prioritized near top of placesInBBox');
});

test('T1-GEO-06: peaksInBBox / landformsInBBox and map.admin1/geoRivers/geoLakes/geoCities/geoMountains render visibly', async (t) => {
  const geo = requireModule('src/geo.js');
  const { createMap } = requireModule('src/index.js');
  const dir = withTempDir(t, 'e2e-geo-render-');
  const outPng = path.join(dir, 'geo-layers.png');

  const peaks = geo.peaksInBBox([70, 20, 145, 50]);
  const landforms = geo.landformsInBBox([70, 20, 145, 50]);
  assert.ok(Array.isArray(peaks) && Array.isArray(landforms), 'Expected arrays from peaksInBBox & landformsInBBox');
  assert.ok(peaks.length + landforms.length >= 1, 'Expected elevation/landform features in Asia bbox');

  const ppm = 4;
  const map = createMap({ w: 200, h: 140, ppm, seed: 'geo-render-1' });
  const proj = map.fitProjection({ country: 'China', admin1: 'Sichuan' });
  map.countries(proj, { focus: ['China'] });
  map.admin1(proj, { country: 'China', highlight: ['Sichuan'] });
  map.geoLakes(proj);
  map.geoRivers(proj);
  map.geoMountains(proj);
  map.geoCities(proj, { max: 6 });

  await map.save(outPng);
  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 800);
  assert.equal(ihdr.height, 560);
  const img = await decodePngPixels(outPng);
  const ink = countInkInBBox(img, { x: 20, y: 20, w: 160, h: 100 }, ppm);
  assert.ok(ink.darkInkCount > 200, 'Expected visible geo lines/borders/labels ink');
});

// ============================================================================
// Group 6: CJK & Bilingual Typography — 6 tests
// ============================================================================

test('T1-CJK-01: listFonts includes bundled CJK font and detectScript/hasCJK classify scripts accurately', () => {
  const Lt = requireModule('engine/lib/letter.js');
  const fonts = Lt.listFonts();
  assert.ok(Array.isArray(fonts) && fonts.length >= 5, 'Expected >= 5 registered fonts including bundled CJK');
  const hasCjkFont = fonts.some((f) => {
    const s = typeof f === 'string' ? f : JSON.stringify(f);
    return /zcool|xiaowei|cjk|han|noto|song|hei/i.test(s);
  });
  assert.ok(hasCjkFont, 'Expected bundled CJK font in listFonts()');

  assert.equal(Lt.hasCJK('四川成都'), true);
  assert.equal(Lt.hasCJK('東京'), true);
  assert.equal(Lt.hasCJK('서울'), true);
  assert.equal(Lt.hasCJK('Roma, Italia'), false);
  assert.equal(typeof Lt.detectScript('四川'), 'string');
  assert.equal(typeof Lt.detectScript('Tokyo'), 'string');
});

test('T1-CJK-02: non-tofu pixel-diff proof for distinct CJK strings', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const Lt = requireModule('engine/lib/letter.js');
  const dir = withTempDir(t, 'e2e-cjk-nontofu-');
  const ppm = 5;

  const mapA = createMap({ w: 120, h: 40, ppm, seed: 'cjk-diff', ocean: false, border: false });
  const boxA = Lt.write(mapA.P.S, '四川盆地', 60, 20, { size: 7, align: 'center' });
  assertValidBBox(boxA, 'boxA');
  const fileA = path.join(dir, 'a.png');
  await mapA.save(fileA);

  const mapB = createMap({ w: 120, h: 40, ppm, seed: 'cjk-diff', ocean: false, border: false });
  const boxB = Lt.write(mapB.P.S, '江南水乡', 60, 20, { size: 7, align: 'center' });
  assertValidBBox(boxB, 'boxB');
  const fileB = path.join(dir, 'b.png');
  await mapB.save(fileB);

  const imgA = await decodePngPixels(fileA);
  const imgB = await decodePngPixels(fileB);
  const unionBox = {
    x0: Math.min(boxA.x0, boxB.x0) - 1,
    y0: Math.min(boxA.y0, boxB.y0) - 1,
    x1: Math.max(boxA.x1, boxB.x1) + 1,
    y1: Math.max(boxA.y1, boxB.y1) + 1,
  };

  const inkA = countInkInBBox(imgA, unionBox, ppm);
  const inkB = countInkInBBox(imgB, unionBox, ppm);
  assert.ok(inkA.darkInkCount > 40, `Expected real CJK ink for 四川盆地, got ${inkA.darkInkCount}`);
  assert.ok(inkB.darkInkCount > 40, `Expected real CJK ink for 江南水乡, got ${inkB.darkInkCount}`);

  const diff = computePatchDiffRatio(imgA, imgB, unionBox, ppm);
  assert.ok(
    diff.inkDiffRatio > 0.15,
    `Expected non-tofu pixel difference > 0.15 between distinct CJK strings, got ${diff.inkDiffRatio.toFixed(3)}`
  );
});

test('T1-CJK-03: pure-Latin rendering remains deterministic with Kevin Serif / Kevin Sans', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const dir = withTempDir(t, 'e2e-latin-det-');
  const fileA = path.join(dir, 'latinA.png');
  const fileB = path.join(dir, 'latinB.png');

  for (const out of [fileA, fileB]) {
    const map = createMap({ w: 100, h: 40, ppm: 5, seed: 'latin-fixed', ocean: false, border: false });
    map.label('FIRENZE', 50, 15, { face: 'serif-bold', size: 4.5 });
    map.seaLabel('MARE ADRIATICO', 50, 28, { size: 3.4 });
    await map.save(out);
  }
  assert.ok(fs.readFileSync(fileA).equals(fs.readFileSync(fileB)), 'Pure-Latin output must be deterministic');
});

test('T1-CJK-04: measureBox returns canonical BBox with ascent/descent matching written bbox and inked pixels', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const Lt = requireModule('engine/lib/letter.js');
  const dir = withTempDir(t, 'e2e-cjk-measure-');
  const outPng = path.join(dir, 'measure.png');
  const ppm = 5;

  const opts = { size: 6, align: 'center' };
  const measured = Lt.measureBox('锦官城 Chengdu', { x: 60, y: 20, ...opts });
  assertValidBBox(measured, 'measureBox');
  assert.ok(measured.w > 5 && measured.h > 2, `Expected non-degenerate measureBox, got ${measured.w}x${measured.h}`);
  assert.ok(Number.isFinite(measured.ascent) && measured.ascent > 0, 'Expected positive finite ascent');
  assert.ok(Number.isFinite(measured.descent) && measured.descent >= 0, 'Expected finite descent >= 0');

  const map = createMap({ w: 120, h: 40, ppm, seed: 'measure-1', ocean: false, border: false });
  const written = Lt.write(map.P.S, '锦官城 Chengdu', 60, 20, opts);
  assertValidBBox(written, 'write');
  assert.ok(written.w > 5 && written.h > 2, `Expected non-degenerate written bbox, got ${written.w}x${written.h}`);

  assert.ok(
    Math.abs(measured.w - written.w) <= 3,
    `measureBox.w (${measured.w}) should match write.w (${written.w}) within 3mm`
  );
  assert.ok(
    Math.abs(measured.h - written.h) <= 3,
    `measureBox.h (${measured.h}) should match write.h (${written.h}) within 3mm`
  );
  assert.ok(
    Math.abs(measured.x0 - written.x0) <= 3,
    `measureBox.x0 (${measured.x0}) should match write.x0 (${written.x0}) within 3mm`
  );
  assert.ok(
    Math.abs(measured.y0 - written.y0) <= 3,
    `measureBox.y0 (${measured.y0}) should match write.y0 (${written.y0}) within 3mm`
  );

  await map.save(outPng);
  const img = await decodePngPixels(outPng);
  const writtenInk = countInkInBBox(img, written, ppm, { padMm: 1 });
  assert.ok(writtenInk.darkInkCount > 50, `Expected dark ink inside written bbox, got ${writtenInk.darkInkCount}`);
  const measuredInk = countInkInBBox(img, measured, ppm, { padMm: 1 });
  assert.ok(measuredInk.darkInkCount > 50, `Expected dark ink inside measured bbox, got ${measuredInk.darkInkCount}`);
});

test('T1-CJK-05: writeBilingual, writeAlongPath, angled write, and block render ink inside valid bboxes', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const Lt = requireModule('engine/lib/letter.js');
  const dir = withTempDir(t, 'e2e-cjk-advanced-');
  const outPng = path.join(dir, 'advanced.png');
  const ppm = 5;
  const map = createMap({ w: 180, h: 120, ppm, seed: 'cjk-adv', ocean: false, border: false });

  const biStack = Lt.writeBilingual(map.P.S, '成都', 'Chengdu', 45, 25, { mode: 'stack', size: 4.5 });
  assertValidBBox(biStack, 'writeBilingual(stack)');
  assertValidBBox(biStack.primary, 'writeBilingual.primary');
  assertValidBBox(biStack.secondary, 'writeBilingual.secondary');

  const biInline = Lt.writeBilingual(map.P.S, '重庆', 'Chongqing', 130, 25, { mode: 'inline', size: 4.0 });
  assertValidBBox(biInline, 'writeBilingual(inline)');

  const curved = Lt.writeAlongPath(
    map.P.S,
    '东海 EAST CHINA SEA',
    [[25, 65], [65, 58], [115, 62], [155, 72]],
    { size: 3.8 }
  );
  assertValidBBox(curved, 'writeAlongPath');

  const angled = Lt.write(map.P.S, '横断山脉', 55, 95, { size: 4.2, angle: -20, align: 'center' });
  assertValidBBox(angled, 'angled write');

  Lt.block(map.P.S, ['天府之国', 'Land of Abundance'], 135, 95, { size: 3.4 });

  await map.save(outPng);
  const img = await decodePngPixels(outPng);
  for (const [name, box] of [
    ['biStack', biStack],
    ['biInline', biInline],
    ['curved', curved],
    ['angled', angled],
  ]) {
    const ink = countInkInBBox(img, box, ppm, { padMm: 1.5 });
    assert.ok(ink.darkInkCount > 25, `${name}: expected dark ink inside bbox`);
  }
});

test('T1-CJK-06: drawCartouche, drawInsetBox, and drawCity render distinct non-tofu CJK text', async (t) => {
  const { createMap } = requireModule('src/index.js');
  const dir = withTempDir(t, 'e2e-cjk-primitives-');
  const ppm = 5;

  // 1. Cartouche: same seed/flag/subtitle, 3 distinct CJK title chars (0 shared)
  const cartA = createMap({ w: 110, h: 68, ppm, seed: 'cjk-cart', border: false });
  cartA.cartouche(12, 12, 84, 44, {
    country: '四川省',
    subtitle: 'Sichuan Province',
    flag: 'CHN',
    capital: '成都 Chengdu',
    language: '汉语',
  });
  const cartAPath = path.join(dir, 'cart-a.png');
  await cartA.save(cartAPath);

  const cartB = createMap({ w: 110, h: 68, ppm, seed: 'cjk-cart', border: false });
  cartB.cartouche(12, 12, 84, 44, {
    country: '江浙沪',
    subtitle: 'Sichuan Province',
    flag: 'CHN',
    capital: '杭州 Chengdu',
    language: '吴语',
  });
  const cartBPath = path.join(dir, 'cart-b.png');
  await cartB.save(cartBPath);

  const cartDiff = computePatchDiffRatio(
    await decodePngPixels(cartAPath),
    await decodePngPixels(cartBPath),
    { x: 15, y: 13.5, w: 56, h: 14.5 },
    ppm
  );
  assert.ok(
    cartDiff.diffPixels >= 40 && cartDiff.inkDiffRatio > 0.12,
    `Expected non-tofu CJK diff in cartouche title band, got diffPixels=${cartDiff.diffPixels}, inkDiffRatio=${cartDiff.inkDiffRatio.toFixed(3)}`
  );

  // 2. InsetBox: same seed/geometry, 6 distinct CJK title chars (0 shared)
  const insetA = createMap({ w: 92, h: 68, ppm, seed: 'cjk-inset', border: false });
  insetA.insetBox(12, 12, 68, 44, '九寨沟风景区');
  const insetAPath = path.join(dir, 'inset-a.png');
  await insetA.save(insetAPath);

  const insetB = createMap({ w: 92, h: 68, ppm, seed: 'cjk-inset', border: false });
  insetB.insetBox(12, 12, 68, 44, '杭州西湖古镇');
  const insetBPath = path.join(dir, 'inset-b.png');
  await insetB.save(insetBPath);

  const insetDiff = computePatchDiffRatio(
    await decodePngPixels(insetAPath),
    await decodePngPixels(insetBPath),
    { x: 14, y: 13.5, w: 62, h: 7 },
    ppm
  );
  assert.ok(
    insetDiff.diffPixels >= 25 && insetDiff.inkDiffRatio > 0.08,
    `Expected non-tofu CJK diff in insetBox title strip, got diffPixels=${insetDiff.diffPixels}, inkDiffRatio=${insetDiff.inkDiffRatio.toFixed(3)}`
  );

  // 3. City: same seed/dot/subtext, 2 distinct CJK city chars (0 shared)
  const cityA = createMap({ w: 60, h: 40, ppm, seed: 'cjk-city', border: false });
  cityA.city(30, 22, '成都', { capital: true, subtext: 'Chengdu' });
  const cityAPath = path.join(dir, 'city-a.png');
  await cityA.save(cityAPath);

  const cityB = createMap({ w: 60, h: 40, ppm, seed: 'cjk-city', border: false });
  cityB.city(30, 22, '重庆', { capital: true, subtext: 'Chengdu' });
  const cityBPath = path.join(dir, 'city-b.png');
  await cityB.save(cityBPath);

  const cityDiff = computePatchDiffRatio(
    await decodePngPixels(cityAPath),
    await decodePngPixels(cityBPath),
    { x: 10, y: 8, w: 40, h: 24 },
    ppm
  );
  assert.ok(
    cityDiff.diffPixels >= 20 && cityDiff.inkDiffRatio > 0.05,
    `Expected non-tofu CJK diff in city label, got diffPixels=${cityDiff.diffPixels}, inkDiffRatio=${cityDiff.inkDiffRatio.toFixed(3)}`
  );
});

// ============================================================================
// Group 7: Layout Tracker, Diagnostics JSON & Auto-Layout — 6 tests
// ============================================================================

test('T1-LAY-01: createLayout registers items, normalizes BBox, and detects overlaps', () => {
  const { createLayout } = requireModule('src/layout.js');
  const layout = createLayout({ w: 300, h: 200, inner: 8 });
  assert.equal(layout.CELL_BORDER, 1);
  assert.equal(layout.CELL_LAND, 2);
  assert.equal(layout.CELL_OCCUPIED, 4);

  const a = layout.register({ id: 'lbl-a', kind: 'label', x: 50, y: 50, w: 30, h: 10, priority: 80 });
  const b = layout.register({ id: 'lbl-b', kind: 'label', x: 65, y: 54, w: 30, h: 10, priority: 40 });
  assertValidBBox(a, 'registered a');
  assertValidBBox(b, 'registered b');

  const ov = layout.overlaps(a, b);
  assert.ok(ov && ov.areaMm2 > 0, 'Expected positive overlap area between a and b');
  const overlaps = layout.findOverlaps();
  assert.equal(overlaps.length, 1);
  assert.ok(['high', 'medium', 'low'].includes(overlaps[0].severity));
});

test('T1-LAY-02: setLandPolygons, isFree, and findEmptyRegions locate open sea space', () => {
  const { createLayout } = requireModule('src/layout.js');
  const layout = createLayout({ w: 300, h: 200, inner: 8, gridStep: 2 });
  // Place land in the right half of the canvas, leaving left half open sea.
  layout.setLandPolygons([[[150, 20], [270, 20], [270, 180], [150, 180]]]);

  assert.equal(layout.isFree(20, 20, 40, 30, { terrain: 'sea' }), true);
  assert.equal(layout.isFree(180, 50, 40, 30, { terrain: 'sea' }), false);

  const emptySea = layout.findEmptyRegions({ terrain: 'sea', minW: 30, minH: 20, maxCount: 4 });
  assert.ok(Array.isArray(emptySea) && emptySea.length >= 1, 'Expected at least one empty sea region');
  assert.equal(emptySea[0].terrain, 'sea');
  assert.ok(emptySea[0].w >= 30 && emptySea[0].h >= 20);
  assert.ok(emptySea[0].areaMm2 >= 600);
});

test('T1-DIAG-01: toDiagnostics returns schema-valid JSON with coverage and summaries', () => {
  const { createLayout } = requireModule('src/layout.js');
  const layout = createLayout({ w: 300, h: 200, inner: 8 });
  layout.setLandPolygons([[[100, 40], [200, 40], [200, 160], [100, 160]]]);
  layout.register({ id: 'city-1', kind: 'city', x: 140, y: 90, w: 20, h: 6 });

  const diag = layout.toDiagnostics({ ppm: 5 });
  assertDiagnosticsSchema(diag);
  assert.equal(diag.canvas.w, 300);
  assert.equal(diag.canvas.h, 200);
  assert.equal(diag.canvas.ppm, 5);
  assert.ok(diag.summary.landCoveragePct > 0 && diag.summary.landCoveragePct < 100);
  assert.ok(diag.summary.seaCoveragePct > 0 && diag.summary.seaCoveragePct < 100);
});

test('T1-AUTO-01: auto-layout resolves overlapping labels in renderSpec', async (t) => {
  const { renderSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-auto-overlap-');
  const outPng = path.join(dir, 'auto-overlap.png');

  const result = await renderSpec({
    schemaVersion: 1,
    meta: { id: 'auto-overlap', seed: 'auto-1' },
    canvas: { w: 220, h: 150, ppm: 4 },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'] },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.5 },
    labels: [
      { id: 'l1', text: 'Roma', x: 110, y: 75, size: 3.2, priority: 90 },
      { id: 'l2', text: 'Vaticano', x: 110, y: 75, size: 3.0, priority: 50 },
      { id: 'l3', text: 'Tevere', x: 111, y: 76, size: 3.0, priority: 40 },
    ],
  });
  await result.save(outPng);
  assertDiagnosticsSchema(result.diagnostics);
  assert.ok(result.diagnostics.items.length >= 3, 'Expected all 3 stacked labels tracked in diagnostics');
  assert.equal(result.diagnostics.overlaps.length, 0, 'Auto-layout must resolve stacked label overlaps');
  assert.equal(result.diagnostics.outOfBounds.length, 0, 'Auto-layout must keep labels in safe frame');
});

test('T1-AUTO-02: placement: auto places cartouche and compass in free space without overlaps', async (t) => {
  const { renderSpec } = requireModule('src/spec.js');
  const dir = withTempDir(t, 'e2e-auto-place-');
  const outPng = path.join(dir, 'auto-place.png');

  const result = await renderSpec({
    schemaVersion: 1,
    meta: { id: 'auto-ornaments', seed: 'auto-2' },
    canvas: { w: 260, h: 170, ppm: 4 },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'] },
    layout: { autoPlace: true, avoidOverlap: true },
    cartouche: { placement: 'auto', w: 66, h: 32, country: 'ITALY', flag: 'ITA' },
    compass: { placement: 'auto', r: 7.5 },
  });
  await result.save(outPng);
  assertDiagnosticsSchema(result.diagnostics);
  assert.ok(result.diagnostics.items.length >= 2, 'Expected auto-placed cartouche and compass tracked in diagnostics');
  assert.equal(result.diagnostics.overlaps.length, 0);
  assert.equal(result.diagnostics.outOfBounds.length, 0);
});

test('T1-AUTO-03: CLI --auto-layout flag enables collision resolution on crowded spec', (t) => {
  const dir = withTempDir(t, 'e2e-cli-autolayout-');
  const specPath = writeSpecFile(dir, 'crowded.json', {
    schemaVersion: 1,
    meta: { id: 'cli-auto', seed: 'cli-auto-1' },
    canvas: { w: 220, h: 150 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'] },
    labels: [
      { id: 'c1', text: 'Tokyo', x: 120, y: 80, size: 3.2, priority: 90 },
      { id: 'c2', text: 'Yokohama', x: 120, y: 80, size: 3.0, priority: 60 },
      { id: 'c3', text: 'Chiba', x: 121, y: 80, size: 3.0, priority: 40 },
    ],
  });
  const outPng = path.join(dir, 'out.png');
  const outDiag = path.join(dir, 'diag.json');

  const res = runCli(['render', specPath, '-o', outPng, '--ppm', '4', '--auto-layout', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `CLI --auto-layout failed: ${res.stderr}`);
  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.ok(diag.items.length >= 3, 'Expected all 3 stacked labels tracked in diagnostics');
  assert.equal(diag.overlaps.length, 0, 'Expected zero overlaps with --auto-layout');
});
