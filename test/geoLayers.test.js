'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const API = require('../src');
const GEO = require('../src/geo');
const M = require('../src/mapPrimitives');
const builder = require('../scripts/build-natural-earth');

test('norm preserves CJK, Hangul composition, Japanese dakuten, and strips Latin diacritics', () => {
  assert.equal(GEO.norm('四川'), '四川');
  assert.equal(GEO.norm('四川省'), '四川省');
  assert.equal(GEO.norm('東京'), '東京');
  assert.equal(GEO.norm('がぱ'), 'がぱ');
  assert.equal(GEO.norm('서울'), '서울');
  assert.equal(GEO.norm('서울').length, 2);
  assert.equal(GEO.norm('Île-de-France'), 'iledefrance');
  assert.equal(GEO.norm("Côte d'Ivoire"), 'cotedivoire');
  assert.equal(GEO.norm('München'), 'munchen');
  assert.equal(GEO.norm('ＣＮ－ＳＣ'), 'cnsc');
  assert.equal(GEO.norm(null), '');
  assert.equal(GEO.norm(undefined), '');
  assert.equal(GEO.norm({}), '');
  assert.equal(GEO.norm(123), '123');
});

test('admin-1 Chinese provinces lookup (English, ISO-3166-2, CJK with & without suffix)', () => {
  const sc = API.getAdmin1('Sichuan');
  assert.equal(sc.id, 'CN-SC');
  assert.equal(sc.adm0, 'CHN');
  assert.equal(API.getAdmin1('CN-SC').id, 'CN-SC');
  assert.equal(API.getAdmin1('四川').id, 'CN-SC');
  assert.equal(API.getAdmin1('四川省').id, 'CN-SC');

  assert.equal(API.getAdmin1('Beijing').id, 'CN-BJ');
  assert.equal(API.getAdmin1('北京').id, 'CN-BJ');
  assert.equal(API.getAdmin1('北京市').id, 'CN-BJ');

  assert.equal(API.getAdmin1('青海').id, 'CN-QH');
  assert.equal(API.getAdmin1('青海省').id, 'CN-QH');
  assert.equal(API.getAdmin1('Tibet').id, 'CN-XZ');
  assert.equal(API.getAdmin1('Xizang').id, 'CN-XZ');
  assert.equal(API.getAdmin1('西藏').id, 'CN-XZ');
  assert.equal(API.getAdmin1('Inner Mongolia').id, 'CN-NM');
  assert.equal(API.getAdmin1('内蒙古').id, 'CN-NM');

  const cnList = API.listAdmin1('CHN');
  assert.ok(cnList.length >= 31, `expected >= 31 Chinese admin-1 units, got ${cnList.length}`);
  assert.ok(cnList.some((r) => r.id === 'CN-SC'));
  assert.deepEqual(API.listAdmin1('China').map((r) => r.id), cnList.map((r) => r.id));
});

test('admin-1 European countries and macro-region grouping (DEU, FRA, ITA, GBR)', () => {
  const bavaria = API.getAdmin1('Bavaria', { country: 'DEU' });
  assert.equal(bavaria.adm0, 'DEU');
  assert.equal(API.getAdmin1('Bayern', { country: 'Germany' }).id, bavaria.id);

  const fraList = API.listAdmin1('FRA');
  assert.ok(fraList.length >= 90);
  const idf = API.getAdmin1('Île-de-France', { country: 'FRA' });
  assert.equal(idf.adm0, 'FRA');
  assert.ok(idf.polygons.length >= 4);

  const itaList = API.listAdmin1('ITA');
  assert.ok(itaList.length >= 100);
  const toscana = API.getAdmin1('Toscana', { country: 'ITA' });
  assert.equal(toscana.adm0, 'ITA');
  assert.ok(toscana.polygons.length >= 5);

  const gbrList = API.listAdmin1('GBR');
  assert.ok(gbrList.length >= 100);
});

test('country disambiguation for Georgia (country vs US state)', () => {
  const countryRes = API.resolveRegion('Georgia');
  assert.equal(countryRes.kind, 'country');
  assert.equal(countryRes.feature.id, 'GEO');

  const usStateRes = API.resolveRegion('Georgia', { country: 'USA' });
  assert.equal(usStateRes.kind, 'admin1');
  assert.equal(usStateRes.feature.adm0, 'USA');
  assert.equal(usStateRes.feature.id, 'US-GA');

  const objRes = API.resolveRegion({ country: 'USA', admin1: 'Georgia' });
  assert.equal(objRes.kind, 'admin1');
  assert.equal(objRes.feature.id, 'US-GA');
});

test('rivers query API: riversInBBox, findRiver, getRiver, Lake Centerline filtering', () => {
  const yangtze = API.getRiver('Yangtze');
  assert.ok(yangtze.lines.length > 0);
  assert.equal(yangtze.kind, 'River');

  const danube = API.findRiver('Danube');
  assert.ok(danube);
  assert.ok(danube.lines.length > 0);

  // Great Lakes region has Lake Centerlines
  const glBox = [-93, 41, -75, 49];
  const noLC = API.riversInBBox(glBox);
  const withLC = API.riversInBBox(glBox, { includeLakeCenterlines: true });
  assert.ok(noLC.every((r) => r.kind !== 'Lake Centerline'));
  assert.ok(withLC.length > noLC.length);
  assert.ok(withLC.some((r) => r.kind === 'Lake Centerline'));

  const majorChina = API.riversInBBox([95, 25, 122, 42], { maxRank: 3 });
  assert.ok(majorChina.length > 0);
  assert.ok(majorChina.every((r) => r.rank <= 3));

  assert.throws(() => API.getRiver('NonexistentRiverXYZ'), /Unknown river/);
});

test('lakes query API: lakesInBBox, findLake, getLake, CJK names', () => {
  const qh = API.getLake('青海湖');
  assert.ok(qh.polygons.length > 0);
  assert.equal(API.findLake('Qinghai Hu').name, qh.name);

  const chinaLakes = API.lakesInBBox([95, 25, 122, 42]);
  assert.ok(chinaLakes.length > 0);
  assert.ok(chinaLakes.some((l) => l.name === qh.name));

  const largeLakes = API.lakesInBBox([95, 25, 122, 42], { minArea: 0.2 });
  assert.ok(largeLakes.every((l) => l.area >= 0.2));

  assert.throws(() => API.getLake('NonexistentLakeXYZ'), /Unknown lake/);
});

test('populated places API: CJK lookup, capitals-first sorting, filtering', () => {
  const chengdu = API.getPlace('成都');
  assert.equal(chengdu.adm0, 'CHN');
  assert.equal(API.getPlace('成都市').name, chengdu.name);
  assert.equal(API.getPlace('Chengdu').name, chengdu.name);

  const tokyo = API.getPlace('東京');
  assert.equal(tokyo.adm0, 'JPN');
  assert.equal(tokyo.capital, true);

  const seoul = API.getPlace('서울');
  assert.equal(seoul.adm0, 'KOR');
  assert.equal(seoul.capital, true);
  assert.equal(API.getPlace('서울특별시').name, seoul.name);

  const eastAsia = API.placesInBBox([100, 20, 145, 45], { limit: 10 });
  assert.equal(eastAsia.length, 10);
  assert.equal(eastAsia[0].capital, true);

  const sichuanPlaces = API.placesInBBox([97, 26, 109, 35], { country: 'CHN', admin1: '四川' });
  assert.ok(sichuanPlaces.some((p) => p.name === 'Chengdu'));

  const bigOnly = API.placesInBBox([100, 20, 145, 45], { minPop: 5_000_000, maxRank: 2 });
  assert.ok(bigOnly.length > 0);
  assert.ok(bigOnly.every((p) => p.pop >= 5_000_000 && p.rank <= 2));

  assert.throws(() => API.getPlace('NonexistentCityXYZ'), /Unknown place/);
});

test('landforms and peaks API: Alps, Himalayas, Everest, Sichuan Basin', () => {
  const himalayaPeaks = API.peaksInBBox([75, 25, 95, 35], { minElev: 7000 });
  assert.ok(himalayaPeaks.some((p) => /Everest/i.test(p.name) && p.elevation >= 8800));
  for (let i = 1; i < himalayaPeaks.length; i++) {
    assert.ok(himalayaPeaks[i - 1].elevation >= himalayaPeaks[i].elevation);
  }

  const euroRanges = API.landformsInBBox([4, 43, 17, 48], { kinds: 'Range/mtn' });
  assert.ok(euroRanges.some((r) => /Alps/i.test(r.name)));

  const chinaBasins = API.landformsInBBox([100, 27, 110, 34], { kinds: ['Basin'] });
  assert.ok(chinaBasins.some((r) => /Sichuan/i.test(r.name)));
});

test('resolveRegion handles bbox, country, ISO-3166-2, admin-1, objects, and errors', () => {
  const b = API.resolveRegion([100, 26, 108, 34]);
  assert.equal(b.kind, 'bbox');
  assert.deepEqual(b.mainBBox, [100, 26, 108, 34]);

  const c = API.resolveRegion('KOR');
  assert.equal(c.kind, 'country');
  assert.equal(c.feature.id, 'KOR');

  const iso = API.resolveRegion('CN-SC');
  assert.equal(iso.kind, 'admin1');
  assert.equal(iso.feature.id, 'CN-SC');

  const name = API.resolveRegion('四川');
  assert.equal(name.kind, 'admin1');
  assert.equal(name.feature.id, 'CN-SC');

  const objCountry = API.resolveRegion({ country: 'Japan' });
  assert.equal(objCountry.kind, 'country');
  assert.equal(objCountry.feature.id, 'JPN');

  assert.throws(() => API.resolveRegion([1, 2, 3]), /Invalid bbox/);
  assert.throws(() => API.resolveRegion(''), /Empty region/);
  assert.throws(() => API.resolveRegion('NonexistentPlaceXYZ'), /Unknown region/);
  assert.throws(() => API.resolveRegion(null), /Invalid region/);
});

test('antimeridian safety across wrapped [170, -25, -170, -10] and extended [170, -25, 190, -10] bboxes', () => {
  const wrapped = [170, -25, -170, -10];
  const extended = [170, -25, 190, -10];

  const cWrapped = new Set(API.countriesInBBox(wrapped).map((c) => c.id));
  const cExtended = new Set(API.countriesInBBox(extended).map((c) => c.id));
  assert.ok(cWrapped.has('FJI'));
  assert.ok(cWrapped.has('TON'));
  assert.deepEqual(cWrapped, cExtended);

  const aWrapped = new Set(API.admin1InBBox(wrapped).map((r) => r.adm0));
  const aExtended = new Set(API.admin1InBBox(extended).map((r) => r.adm0));
  assert.ok(aWrapped.has('FJI'));
  assert.deepEqual(aWrapped, aExtended);

  const pWrapped = new Set(API.placesInBBox(wrapped).map((p) => p.name));
  const pExtended = new Set(API.placesInBBox(extended).map((p) => p.name));
  assert.ok(pWrapped.has('Suva'));
  assert.deepEqual(pWrapped, pExtended);
});

test('clipRuns (Liang-Barsky), simplifyLine, and geoLines handle crossing segments cleanly', () => {
  // Outside-to-outside diagonal segment crossing [0, 0, 10, 10]
  const runs = M.clipRuns([[-5, 5], [15, 5]], 0, 0, 10, 10);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], [[0, 5], [10, 5]]);

  // Exiting and re-entering creates two runs
  const multi = M.clipRuns([[2, 5], [15, 5], [15, 8], [8, 8]], 0, 0, 10, 10);
  assert.equal(multi.length, 2);
  assert.deepEqual(multi[0], [[2, 5], [10, 5]]);
  assert.deepEqual(multi[1], [[10, 8], [8, 8]]);

  // simplifyLine drops collinear middle vertices and preserves sharp corners
  const simp = M.simplifyLine([[0, 0], [5, 0.01], [10, 0], [10, 10]], 0.1);
  assert.deepEqual(simp, [[0, 0], [10, 0], [10, 10]]);

  // geoLines respects minLen and smooth: false
  const yangtze = API.getRiver('Yangtze');
  const proj = API.fitProjection(yangtze.bbox, { frame: [10, 10, 290, 190] });
  const P = { w: 300, h: 200 };
  const smoothRuns = M.geoLines(P, proj, yangtze.lines);
  const rawRuns = M.geoLines(P, proj, yangtze.lines, { smooth: false });
  assert.ok(smoothRuns.length > 0);
  assert.ok(rawRuns.length > 0);
  assert.ok(smoothRuns[0].length >= rawRuns[0].length);
});

test('createMap M2 rendering helpers smoke test (Sichuan province map at ppm: 2)', () => {
  const map = API.createMap({ ppm: 2, seed: 'sichuan-test' });
  const proj = map.fitProjection('Sichuan');

  const a1 = map.admin1(proj, { country: 'CHN', focus: '四川' });
  assert.equal(a1.focus.length, 1);
  assert.equal(a1.focus[0].region.id, 'CN-SC');
  assert.ok(a1.focus[0].rings.length > 0);
  assert.ok(a1.neighbors.length > 0);

  // Borders-only mode
  const borders = map.admin1(proj, { country: 'CHN' });
  assert.equal(borders.focus.length, 0);
  assert.ok(borders.neighbors.length > 0);

  const rivers = map.geoRivers(proj);
  assert.ok(rivers.length > 0);

  const lakes = map.geoLakes(proj);
  assert.ok(Array.isArray(lakes));

  const cities = map.geoCities(proj, { country: 'CHN', limit: 6, labelLang: 'zh', minSpacing: 8 });
  assert.ok(cities.length > 0 && cities.length <= 6);

  const mountains = map.geoMountains(proj);
  assert.ok(Array.isArray(mountains.peaks));
  assert.ok(Array.isArray(mountains.ranges));
});

test('scripts/build-natural-earth.js offline --local mode builds compact .json.gz in temp dir', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ne-build-test-'));
  try {
    const riversGeo = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Test River', name_en: 'Test River En', featurecla: 'River', scalerank: 2 },
          geometry: { type: 'LineString', coordinates: [[100.1234, 30.1234], [101.5678, 30.9876]] },
        },
      ],
    };
    const inFile = path.join(tmpDir, 'rivers.geojson');
    const outDir = path.join(tmpDir, 'out');
    fs.writeFileSync(inFile, JSON.stringify(riversGeo));

    await builder.runBuild(['--only=rivers', `--local=rivers=${inFile}`, `--out-dir=${outDir}`]);
    const outGz = path.join(outDir, 'ne_50m_rivers.json.gz');
    assert.ok(fs.existsSync(outGz));

    const ds = API.loadRivers(outGz);
    assert.equal(ds.rivers.length, 1);
    assert.equal(API.getRiver('Test River', outGz).name, 'Test River');
    assert.equal(API.getRiver('Test River En', outGz).name, 'Test River');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('src/index.js exports all original and M2 APIs', () => {
  const expected = [
    'createMap', 'createProjection', 'fitProjection', 'PALETTE', 'POSES', 'FLAGS',
    'loadCountries', 'getCountry', 'findCountry', 'listCountries', 'countriesInBBox',
    'loadAdmin1', 'getAdmin1', 'findAdmin1', 'listAdmin1', 'admin1InBBox',
    'loadRivers', 'riversInBBox', 'findRiver', 'getRiver',
    'loadLakes', 'lakesInBBox', 'findLake', 'getLake',
    'loadPlaces', 'placesInBBox', 'findPlace', 'getPlace',
    'loadLandforms', 'peaksInBBox', 'landformsInBBox', 'resolveRegion',
  ];
  for (const name of expected) {
    assert.ok(name in API, `missing export ${name}`);
  }
});

test('regression: findRiver/getRiver/findLake/getLake accept indexed and raw dataset objects', () => {
  const riversDs = GEO.loadRivers();
  assert.equal(GEO.findRiver('Nile', riversDs)?.name, 'Nile');
  assert.equal(GEO.getRiver('Nile', riversDs).name, 'Nile');

  const lakesDs = GEO.loadLakes();
  assert.equal(GEO.findLake('Superior', lakesDs)?.name, 'Lake Superior');
  assert.equal(GEO.getLake('Superior', lakesDs).name, 'Lake Superior');

  const rawRivers = { source: 'syn-rivers', rivers: [{ name: 'Mock River', lines: [[[0, 0], [1, 1]]] }] };
  assert.equal(GEO.findRiver('Mock River', rawRivers)?.name, 'Mock River');
  assert.equal(GEO.getRiver('Mock River', { source: rawRivers }).name, 'Mock River');

  const rawLakes = { source: 'syn-lakes', lakes: [{ name: 'Mock Lake', polygons: [[[[0, 0], [1, 0], [1, 1]]]] }] };
  assert.equal(GEO.findLake('Mock Lake', rawLakes)?.name, 'Mock Lake');
  assert.equal(GEO.getLake('Mock Lake', { source: rawLakes }).name, 'Mock Lake');
});

test('regression: norm rejects NaN, Infinity, and booleans (no false TH-55 Nan match)', () => {
  assert.equal(GEO.norm(NaN), '');
  assert.equal(GEO.norm(Infinity), '');
  assert.equal(GEO.norm(-Infinity), '');
  assert.equal(GEO.norm(true), '');
  assert.equal(GEO.norm(false), '');

  assert.equal(GEO.findAdmin1(NaN), null);
  assert.equal(GEO.findAdmin1(Infinity), null);
  assert.equal(GEO.findAdmin1(true), null);
  assert.equal(GEO.findAdmin1(false), null);
  assert.throws(() => GEO.getAdmin1(NaN), /Unknown admin-1 region/);
});

test('regression: inverted latitude bbox and malformed bbox return [] or throw in resolveRegion', () => {
  assert.deepEqual(GEO.countriesInBBox([60, 60, 120, 50]), []);
  assert.deepEqual(GEO.lakesInBBox([103, 54, 110, 53]), []);
  assert.deepEqual(GEO.landformsInBBox([60, 60, 120, 50]), []);
  assert.deepEqual(GEO.admin1InBBox([97, 35, 109, 26]), []);
  assert.deepEqual(GEO.riversInBBox([95, 42, 122, 25]), []);
  assert.deepEqual(GEO.placesInBBox([100, 45, 145, 20]), []);
  assert.deepEqual(GEO.peaksInBBox([75, 35, 95, 25]), []);

  assert.deepEqual(GEO.admin1InBBox(null), []);
  assert.deepEqual(GEO.countriesInBBox({}), []);
  assert.deepEqual(GEO.placesInBBox([0, NaN, 10, 10]), []);
  assert.deepEqual(GEO.riversInBBox([1, 2, 3]), []);

  assert.throws(() => GEO.resolveRegion([10, 50, 20, 10]), /south.*<=.*north|Invalid bbox/i);
  assert.throws(() => GEO.resolveRegion({ bbox: [10, 50, 20, 10] }), /south.*<=.*north|Invalid bbox/i);
});

test('regression: null opts treated as {} across src/geo.js functions', () => {
  assert.equal(GEO.findAdmin1('Sichuan', null)?.id, 'CN-SC');
  assert.equal(GEO.getAdmin1('Sichuan', null).id, 'CN-SC');
  assert.ok(GEO.admin1InBBox([97, 26, 109, 35], null).length > 0);
  assert.ok(GEO.riversInBBox([95, 25, 122, 42], null).length > 0);
  assert.ok(GEO.lakesInBBox([95, 25, 122, 42], null).length > 0);
  assert.ok(GEO.placesInBBox([100, 20, 145, 45], null).length > 0);
  assert.equal(GEO.findPlace('Chengdu', null)?.name, 'Chengdu');
  assert.equal(GEO.getPlace('Chengdu', null).name, 'Chengdu');
  assert.ok(GEO.peaksInBBox([75, 25, 95, 35], null).length > 0);
  assert.ok(GEO.landformsInBBox([4, 43, 17, 48], null).length > 0);
  assert.equal(GEO.resolveRegion('China', null).feature.id, 'CHN');
});

test('regression: scripts/build-natural-earth.js parseArgs rejects empty --only', () => {
  assert.throws(() => builder.parseArgs(['--only=']), /Invalid --only/);
  assert.throws(() => builder.parseArgs(['--only=,']), /Invalid --only/);
  assert.throws(() => builder.parseArgs(['--only']), /Invalid --only/);
});

test('regression: get* functions throw Unknown Error (not TypeError) for Symbol and Object.create(null)', () => {
  const isUnknownError = (err) => (
    err instanceof Error
    && !(err instanceof TypeError)
    && /Unknown/.test(err.message)
  );
  const badInputs = [Symbol('x'), Object.create(null)];
  const getters = [
    GEO.getCountry,
    GEO.getAdmin1,
    GEO.getRiver,
    GEO.getLake,
    GEO.getPlace,
  ];
  for (const fn of getters) {
    for (const input of badInputs) {
      assert.throws(() => fn(input), isUnknownError);
    }
  }
});

test('regression: findRiver/getRiver and findLake/getLake accept empty options object {}', () => {
  assert.equal(GEO.findRiver('Nile', {})?.name, 'Nile');
  assert.equal(GEO.getRiver('Nile', {}).name, 'Nile');
  assert.equal(GEO.findLake('Baikal', {})?.name, 'Lake Baikal');
  assert.equal(GEO.getLake('Baikal', {}).name, 'Lake Baikal');
});

