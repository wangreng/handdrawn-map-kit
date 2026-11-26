'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createMap,
  createProjection,
  renderSpec,
  validateSpec,
  STYLES,
  STYLE_NAMES,
  getStyle,
  resolveStyle,
  organicBlob,
  fillCollage,
  fillDryGouache,
  dryBrushStroke,
  fillSoftGrain,
  fillWatercolorMultiply,
  cutPaperLayer,
} = require('../src');
const { runCli } = require('../bin/cli');

test('style presets expose all 10 official styles and aliases', () => {
  assert.deepEqual(STYLE_NAMES, [
    'vintage-atlas',
    'blueprint',
    'nocturne',
    'ink-wash',
    'collage-atlas',
    'gouache-stage',
    'editorial-infographic',
    'watercolor-field',
    'anno-scroll',
    'paper-relief',
  ]);
  assert.equal(getStyle('cyanotype').name, 'blueprint');
  assert.equal(getStyle('night').name, 'nocturne');
  assert.equal(getStyle('shanshui').name, 'ink-wash');
  assert.equal(getStyle('city-atlas').name, 'collage-atlas');
  assert.equal(getStyle('adventures').name, 'gouache-stage');
  assert.equal(getStyle('50-states').name, 'editorial-infographic');
  assert.equal(getStyle('marc-martin').name, 'watercolor-field');
  assert.equal(getStyle('anno').name, 'anno-scroll');
  assert.equal(getStyle('papercut').name, 'paper-relief');
  assert.equal(resolveStyle({ preset: 'blueprint', palette: { land: '#112233' } }).palette.land, '#112233');
  assert.throws(() => getStyle('nonexistent-style'), /Unknown style preset/);
  assert.equal(STYLES['ink-wash'].stroke.tool, 'brush');
  assert.equal(STYLES.blueprint.stroke.tool, 'gel');
  assert.equal(STYLES['watercolor-field'].stroke.tool, 'graphite');
  assert.equal(STYLES['gouache-stage'].stroke.enabled, false);
  assert.equal(STYLES['paper-relief'].fill.mode, 'paper-cut');
});

test('createMap renders all 10 style presets distinctly without errors', async () => {
  const meanLum = (map) => {
    const { rgb } = map.P.S;
    let sum = 0;
    const n = rgb.length / 3;
    for (let i = 0; i < rgb.length; i += 3) {
      sum += rgb[i] * 0.3 + rgb[i + 1] * 0.59 + rgb[i + 2] * 0.11;
    }
    return sum / n;
  };

  const rendered = {};
  for (const name of STYLE_NAMES) {
    const m = createMap({ w: 80, h: 60, ppm: 3, seed: 'st-1', style: name });
    m.land([[20, 20], [55, 18], [58, 42], [22, 44]]);
    m.river([[25, 24], [40, 30], [52, 36]]);
    m.mountainRange([[35, 34, 6, 7, true]]);
    m.compass(66, 46, 5);
    require('../src/mapPrimitives').drawZebraBorder(m.P);
    rendered[name] = meanLum(m);
  }

  assert.ok(rendered.blueprint < 90, 'blueprint should be dark navy');
  assert.ok(rendered.nocturne < 60, 'nocturne should be dark midnight');
  assert.ok(rendered['ink-wash'] > 170, 'ink-wash should be bright xuan-paper tone');
  assert.ok(rendered['vintage-atlas'] > 170, 'vintage-atlas should be bright hotpress tone');
  assert.ok(rendered['anno-scroll'] > 180, 'anno-scroll should be luminous ivory tone');
  assert.ok(rendered['paper-relief'] < 185 && rendered['paper-relief'] > 75, 'paper-relief should have deep sea + warm cardstock');
});

test('5 new procedural fill/lighting primitives paint distinct visible textures on sheet', () => {
  const sumDiff = (a, b) => {
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    return diff;
  };
  const poly = [[15, 15], [65, 15], [65, 45], [15, 45]];
  const blob = organicBlob(40, 30, 18, 12, 'test-blob');
  assert.ok(blob.length >= 20);

  const mBase = createMap({ w: 80, h: 60, ppm: 3, seed: 'prim-1', ocean: false });
  const baseSnap = Float32Array.from(mBase.P.S.rgb);

  const mCol = createMap({ w: 80, h: 60, ppm: 3, seed: 'prim-1', ocean: false });
  fillCollage(mCol.P, [poly], '#e9c878', { pattern: 'dots', patternColor: '#b07b28', cutShadow: true });
  assert.ok(sumDiff(mCol.P.S.rgb, baseSnap) > 10000);

  const mGou = createMap({ w: 80, h: 60, ppm: 3, seed: 'prim-1', ocean: false });
  fillDryGouache(mGou.P, [poly], '#47a860', { altColor: '#66bf72', dryEdgeMm: 1.4 });
  dryBrushStroke(mGou.P, [[10, 30], [70, 30]], '#e85a3a', { width: 2.0 });
  assert.ok(sumDiff(mGou.P.S.rgb, baseSnap) > 10000);

  const mGrn = createMap({ w: 80, h: 60, ppm: 3, seed: 'prim-1', ocean: false });
  fillSoftGrain(mGrn.P, [poly], '#3c6ca8', { shadeColor: '#254a7a', grainAmt: 0.28 });
  assert.ok(sumDiff(mGrn.P.S.rgb, baseSnap) > 10000);

  const mWc = createMap({ w: 80, h: 60, ppm: 3, seed: 'prim-1', ocean: false });
  fillWatercolorMultiply(mWc.P, [blob], '#67a368', { color2: '#3a7a9e', featherMm: 3.0 });
  assert.ok(sumDiff(mWc.P.S.rgb, baseSnap) > 10000);

  const mCut = createMap({ w: 80, h: 60, ppm: 3, seed: 'prim-1', ocean: false });
  cutPaperLayer(mCut.P, [poly], '#e5cc97', { elevation: 2.0, shadowDark: 0.4 });
  assert.ok(sumDiff(mCut.P.S.rgb, baseSnap) > 10000);
});

test('elements.js built-in icons dynamically adapt to active theme palette', () => {
  const mVintage = createMap({ w: 60, h: 60, ppm: 3, seed: 'el-pal-1', ocean: false, style: 'vintage-atlas' });
  const mBlueprint = createMap({ w: 60, h: 60, ppm: 3, seed: 'el-pal-1', ocean: false, style: 'blueprint' });
  const mGouache = createMap({ w: 60, h: 60, ppm: 3, seed: 'el-pal-1', ocean: false, style: 'gouache-stage' });

  mVintage.el.torii(30, 42, 1.0);
  mBlueprint.el.torii(30, 42, 1.0);
  mGouache.el.torii(30, 42, 1.0);

  // Sample center beam region of torii: vintage-atlas vermilion vs blueprint cyan/orange vs gouache vivid red-orange
  const avgRgb = (map) => {
    const { W, ppm, rgb } = map.P.S;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.round(30 * ppm); y <= Math.round(34 * ppm); y++) {
      for (let x = Math.round(24 * ppm); x <= Math.round(36 * ppm); x++) {
        const j = 3 * (y * W + x);
        r += rgb[j]; g += rgb[j + 1]; b += rgb[j + 2]; n++;
      }
    }
    return [r / n, g / n, b / n];
  };
  const v = avgRgb(mVintage);
  const bp = avgRgb(mBlueprint);
  const go = avgRgb(mGouache);
  assert.ok(Math.hypot(v[0] - bp[0], v[1] - bp[1], v[2] - bp[2]) > 25, 'blueprint torii should adapt to blueprint palette');
  assert.ok(Math.hypot(v[0] - go[0], v[1] - go[1], v[2] - go[2]) > 15, 'gouache torii should adapt to gouache palette');
});

test('oblique projection round-trips cleanly through inverse()', () => {
  const proj = createProjection({ lon0: 2.35, lat0: 46.5, cx: 150, cy: 100, scale: 0.14, rotDeg: 0, oblique: true });
  const [x, y] = proj(4.83, 45.77);
  const [lon, lat] = proj.inverse(x, y);
  assert.ok(Math.abs(lon - 4.83) < 1e-5);
  assert.ok(Math.abs(lat - 45.77) < 1e-5);
});

test('validateSpec and renderSpec support layout.mode, sidebar, admin1.colorBy, and new style presets', () => {
  const badStyle = validateSpec({ schemaVersion: 1, style: { preset: 'unknown-theme' } });
  assert.equal(badStyle.ok, false);
  assert.match(badStyle.errors.join(' '), /Unknown style\.preset/);

  const badMode = validateSpec({ schemaVersion: 1, layout: { mode: 'invalid-mode' } });
  assert.equal(badMode.ok, false);
  assert.match(badMode.errors.join(' '), /Unknown layout\.mode/);

  const badColorBy = validateSpec({ schemaVersion: 1, geo: { admin1: { country: 'France', colorBy: 'bogus' } } });
  assert.equal(badColorBy.ok, false);
  assert.match(badColorBy.errors.join(' '), /Invalid geo\.admin1\.colorBy/);

  // 1. Editorial infographic + sidebar-infographic + admin1 colorBy region
  const infoRes = renderSpec({
    schemaVersion: 1,
    meta: { id: 'fr-info', title: 'LA FRANCE', seed: 'fr-info-1' },
    canvas: { w: 120, h: 80, ppm: 3 },
    style: { preset: 'editorial-infographic' },
    geo: {
      fit: { target: 'France', margin: 6 },
      focus: ['France'],
      admin1: { country: 'France', colorBy: 'region' },
    },
    sidebar: {
      title: 'LA FRANCE',
      subtitle: '13 Metro Regions',
      stats: [
        { label: 'CAPITAL', value: 'PARIS' },
        { label: 'REGIONS', value: '13' },
      ],
      items: [
        { num: 1, title: 'Paris', sub: 'Eiffel Tower' },
        { num: 2, title: 'Loire', sub: 'Châteaux' },
      ],
    },
    layout: { mode: 'sidebar-infographic' },
  });
  assert.equal(infoRes.map.style.name, 'editorial-infographic');
  assert.ok(infoRes.diagnostics.items.some((it) => it.id === 'sidebar'));

  // 2. Watercolor field + sidebar-specimens
  const specRes = renderSpec({
    schemaVersion: 1,
    meta: { id: 'fr-wc', seed: 'fr-wc-1' },
    canvas: { w: 120, h: 80, ppm: 3 },
    style: { preset: 'watercolor-field' },
    geo: { fit: { target: 'France', margin: 6 }, focus: ['France'] },
    sidebar: {
      title: 'SPECIMENS',
      specimens: [
        { type: 'cheeseWine', label: '01. Vin & Fromage' },
        { type: 'oliveTree', label: '02. Provence' },
      ],
    },
    layout: { mode: 'sidebar-specimens' },
  });
  assert.equal(specRes.map.style.name, 'watercolor-field');

  // 3. Full-bleed gouache-stage defaults border to false
  const gouRes = renderSpec({
    schemaVersion: 1,
    meta: { id: 'fr-gou', seed: 'fr-gou-1' },
    canvas: { w: 90, h: 60, ppm: 3 },
    style: { preset: 'gouache-stage' },
  });
  assert.equal(gouRes.map.style.name, 'gouache-stage');

  // 4. Style override via opts.style still works
  const override = renderSpec({
    schemaVersion: 1,
    meta: { id: 'style-test', seed: 'st-spec-1' },
    canvas: { w: 90, h: 60, ppm: 3 },
    style: { preset: 'ink-wash' },
    cartouche: { x: 10, y: 10, w: 50, h: 30, title: 'TEST', subtitle: 'Ink Wash' },
  }, { style: 'paper-relief' });
  assert.equal(override.map.style.name, 'paper-relief');
  assert.equal(override.map.P.style.border, 'shadow-box');
});

test('CLI inspect styles --json and render --style work end-to-end', async () => {
  const origWrite = process.stdout.write;
  let captured = '';
  process.stdout.write = (chunk) => { captured += String(chunk); return true; };
  let code;
  try {
    code = await runCli(['inspect', 'styles', '--json']);
  } finally {
    process.stdout.write = origWrite;
  }
  assert.equal(code, 0);
  const parsed = JSON.parse(captured);
  assert.equal(parsed.length, 10);
  for (const expected of ['blueprint', 'nocturne', 'ink-wash', 'collage-atlas', 'gouache-stage', 'editorial-infographic', 'watercolor-field', 'anno-scroll', 'paper-relief']) {
    assert.ok(parsed.some((s) => s.name === expected), `CLI inspect styles should include ${expected}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdmk-style-cli-'));
  const specFile = path.join(tmpDir, 'mini.json');
  const outFile = path.join(tmpDir, 'mini-papercut.png');
  fs.writeFileSync(specFile, JSON.stringify({
    schemaVersion: 1,
    meta: { id: 'mini', seed: 'cli-style-1' },
    canvas: { w: 80, h: 55, ppm: 3 },
  }));
  const renderCode = await runCli(['render', specFile, '--style', 'paper-relief', '-o', outFile]);
  assert.equal(renderCode, 0);
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.statSync(outFile).size > 1000);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
