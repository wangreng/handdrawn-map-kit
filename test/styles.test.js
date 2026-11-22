'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createMap,
  renderSpec,
  validateSpec,
  STYLES,
  STYLE_NAMES,
  getStyle,
  resolveStyle,
} = require('../src');
const { runCli } = require('../bin/cli');

test('style presets expose vintage-atlas, blueprint, nocturne, and ink-wash with aliases', () => {
  assert.deepEqual(STYLE_NAMES, ['vintage-atlas', 'blueprint', 'nocturne', 'ink-wash']);
  assert.equal(getStyle('cyanotype').name, 'blueprint');
  assert.equal(getStyle('night').name, 'nocturne');
  assert.equal(getStyle('shanshui').name, 'ink-wash');
  assert.equal(resolveStyle({ preset: 'blueprint', palette: { land: '#112233' } }).palette.land, '#112233');
  assert.throws(() => getStyle('nonexistent-style'), /Unknown style preset/);
  assert.ok(STYLES['ink-wash'].stroke.tool === 'brush');
  assert.ok(STYLES.blueprint.stroke.tool === 'gel');
});

test('createMap renders distinct dark blueprint/nocturne and warm ink-wash styles', async () => {
  const meanLum = (map) => {
    const { rgb } = map.P.S;
    let sum = 0;
    const n = rgb.length / 3;
    for (let i = 0; i < rgb.length; i += 3) {
      sum += rgb[i] * 0.3 + rgb[i + 1] * 0.59 + rgb[i + 2] * 0.11;
    }
    return sum / n;
  };

  const mVintage = createMap({ w: 80, h: 60, ppm: 3, seed: 'st-1', style: 'vintage-atlas' });
  const mBlueprint = createMap({ w: 80, h: 60, ppm: 3, seed: 'st-1', style: 'blueprint' });
  const mNocturne = createMap({ w: 80, h: 60, ppm: 3, seed: 'st-1', style: 'nocturne' });
  const mInkWash = createMap({ w: 80, h: 60, ppm: 3, seed: 'st-1', style: 'ink-wash' });

  for (const m of [mVintage, mBlueprint, mNocturne, mInkWash]) {
    m.land([[20, 20], [55, 18], [58, 42], [22, 44]]);
    m.mountainRange([[35, 34, 6, 7, true]]);
    m.compass(66, 46, 5);
    require('../src/mapPrimitives').drawZebraBorder(m.P);
  }

  assert.ok(meanLum(mBlueprint) < 90, 'blueprint should be dark navy');
  assert.ok(meanLum(mNocturne) < 60, 'nocturne should be dark midnight');
  assert.ok(meanLum(mInkWash) > 170, 'ink-wash should be bright xuan-paper tone');
  assert.ok(meanLum(mVintage) > 170, 'vintage-atlas should be bright hotpress tone');
});

test('validateSpec rejects unknown style.preset and renderSpec supports style.preset and opts.style', async () => {
  const bad = validateSpec({ schemaVersion: 1, style: { preset: 'unknown-theme' } });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /Unknown style\.preset/);

  const spec = {
    schemaVersion: 1,
    meta: { id: 'style-test', seed: 'st-spec-1' },
    canvas: { w: 90, h: 60, ppm: 3 },
    style: { preset: 'ink-wash' },
    cartouche: { x: 10, y: 10, w: 50, h: 30, title: 'TEST', subtitle: 'Ink Wash' },
  };
  const res = renderSpec(spec);
  assert.equal(res.map.style.name, 'ink-wash');
  assert.equal(res.map.P.S.paperSpec.name, 'cream');

  const override = renderSpec(spec, { style: 'blueprint' });
  assert.equal(override.map.style.name, 'blueprint');
  assert.equal(override.map.P.S.paperSpec.name, 'navy');
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
  assert.equal(parsed.length, 4);
  assert.ok(parsed.some((s) => s.name === 'blueprint'));
  assert.ok(parsed.some((s) => s.name === 'nocturne'));
  assert.ok(parsed.some((s) => s.name === 'ink-wash'));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdmk-style-cli-'));
  const specFile = path.join(tmpDir, 'mini.json');
  const outFile = path.join(tmpDir, 'mini-nocturne.png');
  fs.writeFileSync(specFile, JSON.stringify({
    schemaVersion: 1,
    meta: { id: 'mini', seed: 'cli-style-1' },
    canvas: { w: 80, h: 55, ppm: 3 },
  }));
  const renderCode = await runCli(['render', specFile, '--style', 'nocturne', '-o', outFile]);
  assert.equal(renderCode, 0);
  assert.ok(fs.existsSync(outFile));
  assert.ok(fs.statSync(outFile).size > 1000);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
