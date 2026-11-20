'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMap, createProjection, fitProjection, getCountry, listCountries, countriesInBBox, loadCountries, FLAGS } = require('../src');
const { resolveFlag } = require('../src/flags');

test('countries are found by three-letter code, two-letter code and name', () => {
  for (const key of ['KOR', 'kor', 'KR', 'South Korea', 'Republic of Korea']) {
    assert.equal(getCountry(key).id, 'KOR', key);
  }
  assert.equal(getCountry('France').id, 'FRA');
  assert.equal(getCountry("Côte d'Ivoire").id, 'CIV');
  // ISO codes that differ from Natural Earth's own
  assert.equal(getCountry('SSD').name, 'S. Sudan');
  assert.equal(getCountry('PSE').name, 'Palestine');
  assert.equal(getCountry('ESH').name, 'W. Sahara');
  assert.ok(listCountries().length > 200);
});

test('an unknown country fails with suggestions', () => {
  assert.throws(() => getCountry('Korea'), /South Korea \(KOR\).*North Korea \(PRK\)/);
  assert.throws(() => getCountry('Atlantis'), /Unknown country "Atlantis"/);
});

test('country geometry is real-world lon/lat', () => {
  const kor = getCountry('KOR');
  const [w, s, e, n] = kor.bbox;
  assert.ok(w > 124 && e < 132 && s > 32 && n < 39, kor.bbox.join(','));
  assert.ok(kor.polygons.length > 1, 'mainland plus islands');
  // Overseas territories do not stretch the box a map is fitted to
  const fra = getCountry('FRA');
  assert.ok(fra.bbox[0] < -50, 'full bbox reaches French Guiana');
  assert.ok(fra.mainBBox[0] > -6 && fra.mainBBox[2] < 10, fra.mainBBox.join(','));
});

test('neighbours are found from a bounding box', () => {
  const ids = countriesInBBox([121.5, 32.5, 134.5, 39.5]).map((c) => c.id).sort();
  assert.deepEqual(ids, ['CHN', 'JPN', 'KOR', 'PRK']);
});

test('neighbours are found across the antimeridian', () => {
  // Fiji-centred frame: 170E .. 170W, written as 170 .. 190
  const ids = countriesInBBox([170, -25, 190, -10]).map((c) => c.id);
  assert.ok(ids.includes('FJI') && ids.includes('TON') && ids.includes('WSM'), ids.join(','));
  const map = createMap({ w: 150, h: 100, ppm: 2, seed: 't' });
  const proj = map.createProjection({ lon0: 180, lat0: -17, cx: 75, cy: 50, scale: 0.06, rotDeg: 0 });
  const drawn = map.countries(proj, { focus: 'FJI' }).neighbors.map((n) => n.country.id);
  assert.ok(drawn.includes('TON'), drawn.join(','));
});

test('a Natural Earth GeoJSON object can be used as the source', () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { ADM0_A3: 'SQR', NAME: 'Squareland', ISO_A2: '-99' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
    }],
  };
  const sq = getCountry('Squareland', loadCountries(geojson));
  assert.equal(sq.id, 'SQR');
  assert.deepEqual(sq.bbox, [0, 0, 2, 2]);
  assert.equal(sq.polygons[0][0].length, 4, 'closing point dropped');
});

test('projection round-trips through inverse', () => {
  const proj = createProjection({ lon0: 127.5, lat0: 36, cx: 150, cy: 100, scale: 0.26, rotDeg: 12 });
  for (const [lon, lat] of [[126.98, 37.56], [129.04, 35.12], [126.53, 33.5]]) {
    const [lon2, lat2] = proj.inverse(...proj(lon, lat));
    assert.ok(Math.abs(lon - lon2) < 1e-9 && Math.abs(lat - lat2) < 1e-9);
  }
});

test('fitProjection keeps the whole box inside the frame', () => {
  const frame = [20, 20, 280, 180];
  for (const id of ['KOR', 'CHL', 'NZL', 'ISL', 'BRA']) {
    for (const rotDeg of [0, 20]) {
      const [w, s, e, n] = getCountry(id).mainBBox;
      const proj = fitProjection([w, s, e, n], { frame, rotDeg });
      let touches = false;
      for (const [lon, lat] of [[w, s], [w, n], [e, s], [e, n], [(w + e) / 2, s], [(w + e) / 2, n]]) {
        const [x, y] = proj(lon, lat);
        assert.ok(x >= frame[0] - 1e-6 && x <= frame[2] + 1e-6 && y >= frame[1] - 1e-6 && y <= frame[3] + 1e-6, `${id} rot ${rotDeg}`);
        if (Math.min(x - frame[0], frame[2] - x, y - frame[1], frame[3] - y) < 0.5) touches = true;
      }
      assert.ok(touches || rotDeg !== 0, `${id} fills the frame`);
    }
  }
});

test('graticule values and hemisphere labels follow the projection', () => {
  const labels = (id) => {
    const map = createMap({ w: 150, h: 100, ppm: 2, seed: 't' });
    return map.graticule(map.fitProjection(id)).map((t) => t.text);
  };
  const korea = labels('KOR');
  assert.ok(korea.length > 0 && korea.every((t) => /°[EN]$/.test(t)), korea.join(' '));
  const chile = labels('CHL');
  assert.ok(chile.some((t) => t.endsWith('°W')) && chile.some((t) => t.endsWith('°S')), chile.join(' '));
  assert.ok(labels('GBR').includes('0°'));
  // Explicit values are still honoured
  const map = createMap({ w: 150, h: 100, ppm: 2, seed: 't' });
  const custom = map.graticule(map.fitProjection('KOR'), { lons: [127], lats: [36] }).map((t) => t.text);
  assert.deepEqual([...new Set(custom)].sort(), ['127°E', '36°N']);
});

test('countries on the far side of the globe do not leak onto the sheet', () => {
  const map = createMap({ w: 150, h: 100, ppm: 2, seed: 't' });
  const proj = map.fitProjection('CAN');
  // Kazakhstan straddles the meridian opposite Canada's centre; its ring must stay in one piece
  assert.deepEqual(map.countryRings(proj, 'KAZ'), []);
  assert.ok(map.countryRings(proj, 'USA').length > 0);
  const labels = map.graticule(proj).map((t) => t.text);
  assert.ok(labels.every((t) => parseFloat(t) <= 180), labels.join(' '));
});

test('one focus colour applies to every focus country', () => {
  const pixelAt = (color, lon, lat) => {
    const map = createMap({ w: 150, h: 100, ppm: 2, seed: 't', border: false });
    const proj = map.fitProjection([124, 33, 131, 43]);
    map.countries(proj, { focus: ['KOR', 'PRK'], color, neighbors: false, waterlines: false });
    const [x, y] = proj(lon, lat).map((v) => Math.round(v * 2));
    const i = 3 * (y * map.P.S.W + x);
    return [...map.P.S.rgb.slice(i, i + 3)].map(Math.round);
  };
  const north = [126.8, 40.2];
  // A single string reaches the second country exactly like an explicit list does
  assert.deepEqual(pixelAt('#3a7d44', ...north), pixelAt(['#3a7d44', '#3a7d44'], ...north));
  assert.notDeepEqual(pixelAt('#3a7d44', ...north), pixelAt(['#3a7d44', '#d65340'], ...north));
});

test('flags resolve by code or country name and reject unknown ones', () => {
  assert.equal(resolveFlag('japan'), FLAGS.JPN);
  assert.equal(resolveFlag('KR'), FLAGS.KOR);
  assert.equal(resolveFlag('South Korea'), FLAGS.KOR);
  const custom = { type: 'stripes', dir: 'h', colors: ['#000', '#fff'] };
  assert.equal(resolveFlag(custom), custom);
  assert.throws(() => resolveFlag('Atlantis'), /No built-in flag/);
});

test('any country renders with neighbours, cartouche and every built-in flag', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hmk-'));
  for (const id of ['KOR', 'ITA', 'CHL', 'NZL']) {
    const map = createMap({ w: 150, h: 100, ppm: 2, seed: id });
    const proj = map.fitProjection(id);
    map.graticule(proj);
    const drawn = map.countries(proj, { focus: id });
    assert.ok(drawn.focus[0].rings.length > 0, id);
    if (id === 'ITA') assert.ok(drawn.neighbors.some((n) => n.country.id === 'FRA'));
    map.cartouche(8, 8, 88, 44, { country: drawn.focus[0].country.name, flag: FLAGS[id] ? id : null, mmPerKm: proj.mmPerKm });
    const file = await map.save(path.join(dir, `${id}.png`));
    assert.ok(fs.statSync(file).size > 1000);
  }
  const sheet = createMap({ w: 150, h: 100, ppm: 2, seed: 'flags', border: false });
  for (const id of Object.keys(FLAGS)) sheet.cartouche(8, 8, 88, 44, { country: id, flag: id });
  sheet.cartouche(8, 8, 88, 44, { flag: (F) => F.field('#ffffff') });
  fs.rmSync(dir, { recursive: true, force: true });
});
