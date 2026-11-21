'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'cli.js');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
  });
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('CLI --help exits 0 and no args exits 1', () => {
  const h = runCli(['--help']);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /handdrawn-map render/);

  const empty = runCli([]);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /Usage:/);
});

test('CLI inspect countries, elements, flags, and error on unknown kind', () => {
  const c = runCli(['inspect', 'countries', 'korea', '--json']);
  assert.equal(c.status, 0, c.stderr);
  const countries = JSON.parse(c.stdout);
  assert.ok(countries.some((row) => row.id === 'KOR'));
  assert.ok(Array.isArray(countries[0].mainBBox));

  const e = runCli(['inspect', 'elements', '--json']);
  assert.equal(e.status, 0, e.stderr);
  const elData = JSON.parse(e.stdout);
  const expectedElementCount = Object.keys(require('../src/elements')).length;
  assert.equal(elData.elements.length, expectedElementCount);
  assert.ok(elData.elements.length >= 65);
  assert.equal(elData.poses.length, 10);

  const f = runCli(['inspect', 'flags', 'KOR', '--json']);
  assert.equal(f.status, 0, f.stderr);
  assert.deepEqual(JSON.parse(f.stdout), ['KOR']);

  const bad = runCli(['inspect', 'unknownkind']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Supported kinds/);
});

test('CLI render and inspect spec handle --ppm, --diagnostics file and stdout (-), --no-border, --seed, and errors', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handdrawn-map-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const specPath = path.join(dir, 'mini.yaml');
  fs.writeFileSync(specPath, [
    'schemaVersion: 1',
    'meta:',
    '  id: cli-test',
    'canvas:',
    '  w: 100',
    '  h: 80',
    '  ppm: 2',
    'geo:',
    '  fit:',
    '    target: KOR',
    '    margin: 5',
    '  focus: [KOR]',
    '  neighbors: false',
    'labels:',
    '  - id: title-lbl',
    '    text: KOREA',
    '    x: 50',
    '    y: 40',
  ].join('\n'));

  // inspect spec --json
  const insp = runCli(['inspect', 'spec', specPath, '--json']);
  assert.equal(insp.status, 0, insp.stderr);
  const inspJson = JSON.parse(insp.stdout);
  assert.equal(inspJson.ok, true);
  assert.equal(inspJson.diagnostics.schemaVersion, 1);

  // render with --diagnostics - (pure JSON on stdout, summary on stderr)
  const outPng = path.join(dir, 'nested', 'out.png');
  const rStdout = runCli(['render', specPath, '-o', outPng, '--ppm', '2', '--seed', 's1', '--diagnostics', '-']);
  assert.equal(rStdout.status, 0, rStdout.stderr);
  const diag = JSON.parse(rStdout.stdout);
  assert.equal(diag.schemaVersion, 1);
  assert.equal(diag.canvas.ppm, 2);
  assert.match(rStdout.stderr, /Rendered/);
  assert.deepEqual(pngSize(outPng), { w: 200, h: 160 });

  // render with --diagnostics <file> and --no-border
  const outPng2 = path.join(dir, 'noborder.png');
  const diagFile = path.join(dir, 'diag', 'report.json');
  const rFile = runCli(['render', specPath, '-o', outPng2, '--ppm', '2', '--no-border', '--diagnostics', diagFile]);
  assert.equal(rFile.status, 0, rFile.stderr);
  const savedDiag = JSON.parse(fs.readFileSync(diagFile, 'utf8'));
  assert.deepEqual(savedDiag.canvas.safeFrame, [0, 0, 100, 80]);

  // Invalid spec exits 1 for both render and inspect spec
  const badSpecPath = path.join(dir, 'bad.json');
  fs.writeFileSync(badSpecPath, JSON.stringify({ schemaVersion: 2, canvas: { w: -10, h: 50 } }));
  assert.equal(runCli(['render', badSpecPath, '-o', path.join(dir, 'x.png')]).status, 1);
  const badInsp = runCli(['inspect', 'spec', badSpecPath, '--json']);
  assert.equal(badInsp.status, 1);
  assert.equal(JSON.parse(badInsp.stdout).ok, false);

  // Missing file exits 1
  assert.equal(runCli(['render', path.join(dir, 'missing.yaml')]).status, 1);
});
