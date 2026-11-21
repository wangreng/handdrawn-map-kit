'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ASSETS = require('../src/assets');
const { validateSpec, planSpec, renderSpec } = require('../src/spec');
const { runCli } = require('../bin/cli');

const SAMPLE_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#88aa66" stroke="#223311" stroke-width="1.2"/></svg>';

function mkTmpDir(prefix = 'hmk-assets-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('getUserAssetsDir defaults outside the repo and respects HANDDRAWN_MAP_ASSETS_DIR', () => {
  const prev = process.env.HANDDRAWN_MAP_ASSETS_DIR;
  try {
    delete process.env.HANDDRAWN_MAP_ASSETS_DIR;
    const defDir = ASSETS.getUserAssetsDir();
    assert.equal(defDir, path.join(os.homedir(), '.handdrawn-map', 'elements'));
    assert.ok(!defDir.startsWith(path.resolve(__dirname, '..')), 'default user asset dir must be outside repo');

    const custom = mkTmpDir();
    process.env.HANDDRAWN_MAP_ASSETS_DIR = custom;
    assert.equal(ASSETS.getUserAssetsDir(), path.resolve(custom));
    fs.rmSync(custom, { recursive: true, force: true });
  } finally {
    if (prev === undefined) delete process.env.HANDDRAWN_MAP_ASSETS_DIR;
    else process.env.HANDDRAWN_MAP_ASSETS_DIR = prev;
  }
});

test('saveSvgAsset saves strictly to private local dir and rejects invalid names/SVGs', () => {
  const tmpDir = mkTmpDir();
  try {
    const res1 = ASSETS.saveSvgAsset('baobab_test', SAMPLE_SVG, { assetDir: tmpDir });
    assert.equal(res1.saved, true);
    assert.equal(res1.path, path.join(tmpDir, 'baobab_test.svg'));
    assert.ok(fs.existsSync(res1.path));

    // Existing file is skipped unless overwrite: true
    const res2 = ASSETS.saveSvgAsset('baobab_test', SAMPLE_SVG, { assetDir: tmpDir });
    assert.equal(res2.saved, false);
    assert.equal(res2.skipped, true);

    const res3 = ASSETS.saveSvgAsset('baobab_test', SAMPLE_SVG, { assetDir: tmpDir, overwrite: true });
    assert.equal(res3.saved, true);
    assert.equal(res3.overwritten, true);

    // Repo dir must NOT have been written to
    assert.ok(!fs.existsSync(path.join(ASSETS.getRepoAssetsDir(), 'baobab_test.svg')));

    // Path traversal & empty SVGs are rejected
    assert.throws(() => ASSETS.saveSvgAsset('../evil', SAMPLE_SVG, { assetDir: tmpDir }), /Invalid SVG asset name/);
    assert.throws(() => ASSETS.saveSvgAsset('empty_svg', '<svg viewBox="0 0 10 10"></svg>', { assetDir: tmpDir }), /renderable shapes/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validateSpec, planSpec, and renderSpec resolve named local SVG assets seamlessly', async () => {
  const tmpDir = mkTmpDir();
  const outPng = path.join(tmpDir, 'out.png');
  try {
    ASSETS.saveSvgAsset('custom_lantern', SAMPLE_SVG, { assetDir: tmpDir });

    const spec = {
      schemaVersion: 1,
      canvas: { w: 120, h: 80, ppm: 2, border: false },
      elements: [
        { id: 'el-1', type: 'custom_lantern', x: 60, y: 40, scale: 0.8 },
      ],
    };

    const v = validateSpec(spec, { assetDir: tmpDir });
    assert.equal(v.ok, true, `Expected valid spec, got errors: ${v.errors.join('; ')}`);
    assert.equal(v.spec.elements[0].type, 'svg');
    assert.equal(v.spec.elements[0]._resolvedAsset.name, 'custom_lantern');

    const p = planSpec(spec, { assetDir: tmpDir });
    assert.equal(p.ok, true);
    assert.equal(p.diagnostics.items.length, 1);

    const rendered = renderSpec(spec, { assetDir: tmpDir });
    await rendered.save(outPng);
    assert.ok(fs.existsSync(outPng));
    assert.ok(fs.statSync(outPng).size > 200);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI assets save & render --save-assets isolate assets to local user dir', async () => {
  const tmpDir = mkTmpDir();
  const assetDir = path.join(tmpDir, 'my-private-assets');
  const specFile = path.join(tmpDir, 'sample.json');
  const outPng = path.join(tmpDir, 'sample.png');
  try {
    const spec = {
      schemaVersion: 1,
      canvas: { w: 100, h: 70, ppm: 2, border: false },
      elements: [
        { id: 'el-baobab-cli', type: 'svg', x: 50, y: 35, svg: SAMPLE_SVG },
      ],
    };
    fs.writeFileSync(specFile, JSON.stringify(spec), 'utf8');

    const code1 = await runCli(['render', specFile, '-o', outPng, '--save-assets', '--asset-dir', assetDir]);
    assert.equal(code1, 0);
    assert.ok(fs.existsSync(outPng));
    assert.ok(fs.existsSync(path.join(assetDir, 'baobab-cli.svg')));
    assert.ok(!fs.existsSync(path.join(ASSETS.getRepoAssetsDir(), 'baobab-cli.svg')));

    const code2 = await runCli(['assets', 'list', 'baobab-cli', '--asset-dir', assetDir, '--json']);
    assert.equal(code2, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
