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

test('regression: non-string country/kind/kinds (Object.create(null), Symbol, throwing toString) never crash', () => {
  const boom = { toString() { throw new Error('boom'); } };
  const badValues = [Object.create(null), Symbol('x'), boom, { id: Symbol('id') }, { id: Object.create(null) }];
  const bbox = [95, 25, 115, 36];
  const isCleanUnknownError = (err) => (
    err instanceof Error
    && !(err instanceof TypeError)
    && err.message !== 'boom'
    && /Unknown/.test(err.message)
  );

  for (const bad of badValues) {
    assert.equal(GEO.findAdmin1('Sichuan', { country: bad }), null);
    assert.deepEqual(GEO.listAdmin1(bad), []);
    assert.deepEqual(GEO.admin1InBBox(bbox, { country: bad }), []);
    assert.throws(() => GEO.getAdmin1('Sichuan', { country: bad }), isCleanUnknownError);

    assert.equal(GEO.findPlace('Chengdu', { country: bad }), null);
    assert.deepEqual(GEO.placesInBBox(bbox, { country: bad }), []);
    assert.throws(() => GEO.getPlace('Chengdu', { country: bad }), isCleanUnknownError);

    assert.deepEqual(GEO.peaksInBBox([70, 20, 110, 45], { kind: bad }), []);
    assert.deepEqual(GEO.peaksInBBox([70, 20, 110, 45], { kind: [bad] }), []);
    assert.deepEqual(GEO.landformsInBBox([70, 20, 110, 45], { kinds: bad }), []);
    assert.deepEqual(GEO.landformsInBBox([70, 20, 110, 45], { kinds: [bad] }), []);

    assert.throws(() => GEO.resolveRegion('Sichuan', { country: bad }), isCleanUnknownError);
    assert.throws(() => GEO.resolveRegion({ country: bad, admin1: 'Sichuan' }), isCleanUnknownError);
    assert.throws(() => GEO.resolveRegion({ country: bad }), isCleanUnknownError);
  }

  // Verify createMap M2 helpers also handle bad country/kind/kinds cleanly without TypeError/boom
  const map = API.createMap({ w: 150, h: 100, ppm: 2, seed: 'bad-opts' });
  const proj = map.fitProjection('CN-SC');
  for (const bad of [Object.create(null), Symbol('x'), boom]) {
    assert.deepEqual(map.admin1(proj, { country: bad }), { focus: [], neighbors: [] });
    assert.deepEqual(map.geoCities(proj, { country: bad }), []);
    const mRes = map.geoMountains(proj, { peakKind: bad, kinds: bad });
    assert.deepEqual(mRes, { peaks: [], ranges: [] });
  }
});

test('regression: null options accepted across createMap M2 helpers and geoLines', () => {
  const map = API.createMap({ w: 150, h: 100, ppm: 2, seed: 'null-opts' });
  const proj = map.fitProjection('Sichuan', null);
  assert.ok(map.admin1Rings(proj, 'CN-SC', null).length > 0);
  assert.ok(map.admin1(proj, null).neighbors.length > 0);
  assert.ok(Array.isArray(map.geoRivers(proj, null)));
  assert.ok(Array.isArray(map.geoLakes(proj, null)));
  assert.ok(Array.isArray(map.geoCities(proj, null)));
  const m = map.geoMountains(proj, null);
  assert.ok(Array.isArray(m.peaks) && Array.isArray(m.ranges));
  const runs = M.geoLines({ w: 150, h: 100 }, proj, [[[100, 30], [105, 31]]], null);
  assert.ok(runs.length > 0);
});

test('regression: geoLines unwraps antimeridian-crossing polylines smoothly and clips far-side lines', () => {
  const proj = M.createProjection({ lon0: 179.5, lat0: 65, cx: 150, cy: 100, scale: 0.5, rotDeg: 0 });
  const P = { w: 300, h: 200 };
  const line = [[179, 65], [179.5, 65.1], [-179.5, 65.2], [-179, 65.3]];

  const smoothRuns = M.geoLines(P, proj, [line]);
  assert.equal(smoothRuns.length, 1);
  const pts = smoothRuns[0];
  assert.ok(pts.length >= 4);
  for (let i = 1; i < pts.length; i++) {
    const step = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    assert.ok(step <= 10, `expected continuous step <= 10 mm, got ${step.toFixed(2)} mm at index ${i}`);
  }
  // Both sides of lon0 = 179.5 (cx = 150) are preserved
  assert.ok(pts[0][0] < 145, `expected western vertex < 145 mm, got ${pts[0][0]}`);
  assert.ok(pts[pts.length - 1][0] > 180, `expected eastern vertex > 180 mm, got ${pts[pts.length - 1][0]}`);

  // Raw (unsmoothed) preserves monotonically increasing x across ±180°
  const rawRuns = M.geoLines(P, proj, [line], { smooth: false, simplify: 0 });
  assert.equal(rawRuns.length, 1);
  assert.equal(rawRuns[0].length, 4);
  for (let i = 1; i < rawRuns[0].length; i++) {
    assert.ok(rawRuns[0][i][0] > rawRuns[0][i - 1][0]);
  }

  // Reverse direction crossing ±180° also stays continuous
  const revRuns = M.geoLines(P, proj, [line.slice().reverse()], { smooth: false, simplify: 0 });
  assert.equal(revRuns.length, 1);
  assert.equal(revRuns[0].length, 4);

  // Far-side-of-globe line crossing lon0 - 180° (-0.5°) clips cleanly to []
  const farSide = M.geoLines(P, proj, [[[1, 65], [-1, 65]]], { smooth: false, simplify: 0 });
  assert.deepEqual(farSide, []);
});

test('regression: *InBBox numeric filter options ignore hostile/non-finite values without throwing', () => {
  const B = [-180, -90, 180, 90];
  const bads = [
    Object.create(null),
    Symbol('x'),
    { toString() { throw new Error('boom'); } },
    { valueOf() { throw new Error('boomVal'); } },
    NaN,
    Infinity,
    -Infinity,
    '5',
  ];

  const baseRivers = GEO.riversInBBox(B);
  const baseLakes = GEO.lakesInBBox(B);
  const basePlaces = GEO.placesInBBox(B);
  const basePeaks = GEO.peaksInBBox(B);
  const baseLandforms = GEO.landformsInBBox(B);

  for (const b of bads) {
    assert.equal(GEO.riversInBBox(B, { minRank: b }).length, baseRivers.length);
    assert.equal(GEO.riversInBBox(B, { maxRank: b }).length, baseRivers.length);
    assert.equal(GEO.lakesInBBox(B, { maxRank: b }).length, baseLakes.length);
    assert.equal(GEO.lakesInBBox(B, { minArea: b }).length, baseLakes.length);
    assert.equal(GEO.placesInBBox(B, { maxRank: b }).length, basePlaces.length);
    assert.equal(GEO.placesInBBox(B, { minPop: b }).length, basePlaces.length);
    assert.equal(GEO.placesInBBox(B, { limit: b }).length, basePlaces.length);
    assert.equal(GEO.peaksInBBox(B, { minElev: b }).length, basePeaks.length);
    assert.equal(GEO.landformsInBBox(B, { maxRank: b }).length, baseLandforms.length);
  }
});

test('regression: bboxOf, mainBBoxOf, and resolveRegion handle malformed polygons and invalid pre-resolved bboxes', () => {
  const empty = [Infinity, Infinity, -Infinity, -Infinity];
  assert.deepEqual(GEO.bboxOf(null), empty);
  assert.deepEqual(GEO.bboxOf([]), empty);
  assert.deepEqual(GEO.bboxOf([[]]), empty);
  assert.deepEqual(GEO.bboxOf([[null, [1], [NaN, 0]]]), empty);

  assert.deepEqual(GEO.mainBBoxOf(null), empty);
  assert.deepEqual(GEO.mainBBoxOf([]), empty);
  assert.deepEqual(GEO.mainBBoxOf([[]]), empty);
  assert.deepEqual(GEO.mainBBoxOf([[null]]), empty);

  const isInvalidRegionErr = (err) => (
    err instanceof Error
    && !(err instanceof TypeError)
    && /Invalid region target/i.test(err.message)
  );
  assert.throws(() => GEO.resolveRegion({ polygons: [[]] }), isInvalidRegionErr);
  assert.throws(() => GEO.resolveRegion({ polygons: [] }), isInvalidRegionErr);
  assert.throws(
    () => GEO.resolveRegion({ kind: 'bbox', bbox: [NaN, 0, 10, 10], mainBBox: [0, 0, 10, 10] }),
    isInvalidRegionErr,
  );
  assert.throws(
    () => GEO.resolveRegion({ kind: 'bbox', bbox: [0, 0, 10, 10], mainBBox: [0, 20, 10, 10] }),
    isInvalidRegionErr,
  );
  assert.throws(
    () => GEO.resolveRegion({ kind: 'bbox', bbox: [Infinity, 0, 10, 10], mainBBox: [0, 0, 10, 10] }),
    isInvalidRegionErr,
  );
});

test('regression: fromGeoJSON rejects hostile property values without throwing', () => {
  const boom = { toString() { throw new Error('boom'); } };
  const poly = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const fc = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { ADM0_A3: Object.create(null), NAME: 'SkipMe' },
        geometry: poly,
      },
      {
        type: 'Feature',
        properties: { ADM0_A3: Symbol('x'), NAME: boom },
        geometry: poly,
      },
      {
        type: 'Feature',
        properties: {
          ADM0_A3: Object.create(null),
          ISO_A3: 'TST',
          ISO_A3_EH: boom,
          ISO_A2: Symbol('a2'),
          NAME: 'Testland',
          ADMIN: boom,
          CONTINENT: Object.create(null),
        },
        geometry: poly,
      },
    ],
  };

  const parsed = GEO.fromGeoJSON(fc);
  assert.equal(parsed.countries.length, 1);
  assert.equal(parsed.countries[0].id, 'TST');
  assert.equal(parsed.countries[0].name, 'Testland');
  assert.equal(parsed.countries[0].iso2, null);
  assert.equal(parsed.countries[0].continent, null);
});

test('regression: resolveRegion rejects sparse 4-element bbox arrays', () => {
  const isInvalidBBoxErr = (err) => (
    err instanceof Error
    && !(err instanceof TypeError)
    && /Invalid bbox target/i.test(err.message)
  );
  // eslint-disable-next-line no-sparse-arrays
  const sparse1 = [10, , 20, 30];
  const sparse2 = new Array(4);
  assert.throws(() => GEO.resolveRegion(sparse1), isInvalidBBoxErr);
  assert.throws(() => GEO.resolveRegion(sparse2), isInvalidBBoxErr);
  assert.throws(() => GEO.resolveRegion({ bbox: sparse1 }), isInvalidBBoxErr);
  assert.throws(() => GEO.resolveRegion({ bbox: sparse2 }), isInvalidBBoxErr);
});

test('regression: mainBBoxOf handles non-numeric and non-finite ring coordinates without crashing or NaN', () => {
  const boom = { valueOf() { throw new Error('boom'); } };
  const badPoly = [[[Symbol('x'), 0], [boom, 1], [NaN, Infinity], [0, 0]]];
  const goodPoly = [[[10, 20], [12, 20], [12, 22], [10, 22]]];

  // Only bad polygon -> finite coordinates ignored or empty bbox, never throws
  const onlyBad = GEO.mainBBoxOf([badPoly]);
  assert.equal(onlyBad.length, 4);
  assert.ok(!onlyBad.some((v) => Number.isNaN(v)));

  // Bad polygon alongside valid polygon -> picks valid polygon cleanly
  const mixed = GEO.mainBBoxOf([badPoly, goodPoly]);
  assert.deepEqual(mixed, [10, 20, 12, 22]);
});

test('regression: geoLines skips Infinity/NaN/malformed points without hanging', () => {
  const proj = M.createProjection({ lon0: 105, lat0: 30, cx: 150, cy: 100, scale: 0.2, rotDeg: 0 });
  const P = { w: 300, h: 200 };

  assert.deepEqual(M.geoLines(P, proj, [[[Infinity, 30], [105, 30]]]), []);
  assert.deepEqual(M.geoLines(P, proj, [[[105, 30], [-Infinity, 30]]]), []);
  assert.deepEqual(M.geoLines(P, proj, [[[NaN, 30], [105, NaN], [null, 30]]]), []);

  // Line with valid points plus an Infinity point still projects the valid points
  const runs = M.geoLines(P, proj, [[[100, 30], [Infinity, 30], [106, 31], [-Infinity, 32], [110, 32]]], { smooth: false });
  assert.equal(runs.length, 1);
  assert.ok(runs[0].length >= 2);
});

test('regression: fromGeoJSON skips null, undefined, and primitive feature entries', () => {
  const poly = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const fc = {
    type: 'FeatureCollection',
    features: [
      null,
      undefined,
      42,
      'bad',
      { type: 'Feature', properties: { ADM0_A3: 'OK1', NAME: 'Validland' }, geometry: poly },
    ],
  };
  const parsed = GEO.fromGeoJSON(fc);
  assert.equal(parsed.countries.length, 1);
  assert.equal(parsed.countries[0].id, 'OK1');
});

test('regression: macro-region names and shared aliases resolve to full composite regions without shadowing individual units', () => {
  const tuscanyIt = GEO.findAdmin1('Tuscany', { country: 'ITA' });
  assert.equal(tuscanyIt?.id, 'ITA:Toscana');
  assert.equal(tuscanyIt?.parts?.length, 10);

  const tuscanyGlobal = GEO.findAdmin1('Tuscany');
  assert.equal(tuscanyGlobal?.id, 'ITA:Toscana');
  assert.equal(tuscanyGlobal?.parts?.length, 10);

  const piemonte = GEO.findAdmin1('Piemonte', { country: 'ITA' });
  assert.equal(piemonte?.id, 'ITA:Piemonte');
  assert.equal(piemonte?.parts?.length, 8);

  const piedmont = GEO.findAdmin1('Piedmont', { country: 'ITA' });
  assert.equal(piedmont?.id, 'ITA:Piemonte');
  assert.equal(piedmont?.parts?.length, 8);

  const emilia = GEO.findAdmin1('Emilia-Romagna', { country: 'ITA' });
  assert.equal(emilia?.id, 'ITA:Emilia-Romagna');
  assert.equal(emilia?.parts?.length, 9);

  const lombardy = GEO.findAdmin1('Lombardy', { country: 'ITA' });
  assert.equal(lombardy?.id, 'ITA:Lombardia');
  assert.equal(lombardy?.parts?.length, 12);

  const brittany = GEO.findAdmin1('Brittany', { country: 'FRA' });
  assert.equal(brittany?.id, 'FRA:Bretagne');
  assert.equal(brittany?.parts?.length, 4);

  const corsica = GEO.findAdmin1('Corsica', { country: 'FRA' });
  assert.equal(corsica?.id, 'FRA:Corse');
  assert.equal(corsica?.parts?.length, 2);

  const sicilia = GEO.findAdmin1('Sicilia', { country: 'ITA' });
  assert.equal(sicilia?.id, 'ITA:Sicily');
  assert.equal(sicilia?.parts?.length, 9);

  // Individual provinces and single-unit aliases remain intact
  assert.equal(GEO.findAdmin1('Arezzo', { country: 'ITA' })?.id, 'IT-AR');
  assert.equal(GEO.findAdmin1('Bologna', { country: 'ITA' })?.id, 'IT-BO');
  assert.equal(GEO.findAdmin1('IT-AR')?.id, 'IT-AR');
  assert.equal(GEO.findAdmin1('Sichuan')?.id, 'CN-SC');
  assert.equal(GEO.findAdmin1('四川')?.id, 'CN-SC');
  assert.equal(GEO.findAdmin1('Bavaria')?.id, 'DE-BY');
});

test('regression: fitProjection handles wrapped antimeridian bboxes and rejects zero-span bboxes', () => {
  const frame = [10, 10, 290, 190];
  const pPacific = M.fitProjection([170, -25, -170, -10], { frame });
  assert.equal(pPacific.params.lon0, 180);
  assert.ok(Number.isFinite(pPacific.params.scale) && pPacific.params.scale > 0);
  assert.ok(Number.isFinite(pPacific.params.cx) && Number.isFinite(pPacific.params.cy));
  for (const [lon, lat] of [[170, -25], [-170, -10], [180, -17.5]]) {
    const [x, y] = pPacific(lon, lat);
    assert.ok(x >= frame[0] - 0.5 && x <= frame[2] + 0.5, `x=${x} out of frame`);
    assert.ok(y >= frame[1] - 0.5 && y <= frame[3] + 0.5, `y=${y} out of frame`);
  }

  const pAsym = M.fitProjection([170, -25, -160, -10], { frame });
  assert.equal(pAsym.params.lon0, -175);
  assert.ok(Number.isFinite(pAsym.params.scale) && pAsym.params.scale > 0);

  const isInvalidBBoxErr = (err) => (
    err instanceof Error
    && !(err instanceof TypeError)
    && /Invalid bbox/i.test(err.message)
  );
  assert.throws(() => M.fitProjection([10, 20, 10, 20], { frame }), isInvalidBBoxErr);
  assert.throws(() => M.fitProjection([10, 20, 15, 20], { frame }), isInvalidBBoxErr);
  assert.throws(() => M.fitProjection([10, 20, 10, 25], { frame }), isInvalidBBoxErr);
});



