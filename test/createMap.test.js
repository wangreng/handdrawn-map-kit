'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMap, PALETTE: C, POSES } = require('../src');
const EL = require('../src/elements');

const pngSize = (file) => {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};

function withArgv(extra, fn) {
  const saved = process.argv;
  process.argv = [...saved, ...extra];
  try {
    return fn();
  } finally {
    process.argv = saved;
  }
}

test('resolution comes from the ppm option, not from the host command line', () => {
  const map = withArgv(['--fast'], () => createMap({ w: 30, h: 20, ocean: false }));
  assert.equal(map.P.S.W, 300);
  assert.equal(map.P.S.H, 200);
  const small = createMap({ w: 30, h: 20, ppm: 4, ocean: false });
  assert.equal(small.P.S.W, 120);
  assert.equal(small.P.S.H, 80);
});

test('every illustration element is exposed on map.el and draws', () => {
  const map = createMap({ w: 60, h: 40, ppm: 4, seed: 'elements' });
  assert.deepEqual(Object.keys(map.el).sort(), Object.keys(EL).sort());
  for (const name of Object.keys(EL)) {
    assert.doesNotThrow(() => map.el[name](30, 26, 0.6), `el.${name}`);
  }
});

test('every pose of the character rig draws', () => {
  const map = createMap({ w: 60, h: 40, ppm: 4, seed: 'poses' });
  assert.ok(Object.keys(POSES).length > 0);
  for (const pose of Object.keys(POSES)) {
    assert.doesNotThrow(() => map.person(30, 34, 0.5, { seed: pose, pose }), `pose ${pose}`);
  }
});

test('a full map renders to a PNG of w*ppm by h*ppm pixels', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handdrawn-map-kit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const map = createMap({ w: 120, h: 80, ppm: 4, seed: 'smoke' });
  const proj = map.createProjection({ lon0: 139.5, lat0: 36.5, cx: 60, cy: 40, scale: 0.14, rotDeg: 10 });
  const ticks = map.graticule(proj, { lons: [138, 140], lats: [36, 37] });
  assert.ok(ticks.length > 0);

  const poly = map.D.curve(proj.pts([[139.0, 35.0], [140.8, 35.7], [140.9, 38.3], [138.9, 37.9]]), true, 0.22);
  map.coastWaterlines([poly]);
  map.part(poly, C.land);
  map.mountainRange([[60, 36, 5, 6, true]]);
  map.river([[52, 30], [58, 38], [64, 44]]);
  map.route([[50, 46], [70, 34]]);
  map.riceFields(66, 42, 8, 4);
  map.waves(20, 60, 0.7, 2);
  map.callout([30, 30], [50, 40]);
  map.city(60, 44, 'Tokyo', { capital: true });
  map.seaLabel('PACIFIC', 95, 62);
  map.regionLabel('KANTO', 60, 50);
  map.label('Label', 24, 22);
  map.compass(100, 20, 6, { angle: proj.northAngle(139.5, 36.5) });
  map.insetBox(84, 40, 28, 22, 'INSET');
  map.cartouche(12, 12, 60, 44, { country: 'JAPAN', flag: 'japan' });

  const file = path.join(dir, 'nested', 'map.png');
  assert.equal(await map.save(file), file);
  assert.deepEqual(pngSize(file), [480, 320]);
});

test('the same seed renders the same image', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handdrawn-map-kit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const render = async (seed, name) => {
    const map = createMap({ w: 60, h: 40, ppm: 4, seed });
    map.land([[20, 12], [44, 14], [40, 30], [18, 28]]);
    map.el.pine(30, 24, 0.6);
    map.city(34, 20, 'City');
    const file = path.join(dir, name);
    await map.save(file);
    return fs.readFileSync(file);
  };
  const a = await render('seed-a', 'a.png');
  assert.ok(a.equals(await render('seed-a', 'a2.png')));
  assert.ok(!a.equals(await render('seed-b', 'b.png')));
});
