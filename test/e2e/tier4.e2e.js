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
  countInkInBBox,
  writeSpecFile,
  assertDiagnosticsSchema,
} = require('./helpers');

function assertItemsPresent(diag, ids, { cartouche = false, compass = false } = {}) {
  for (const id of ids) {
    assert.ok(diag.items.some((it) => it.id === id), `Expected item ${id} in diagnostics`);
  }
  if (cartouche) {
    assert.ok(
      diag.items.some((it) => it.kind === 'cartouche' || /cartouche/i.test(it.id)),
      'Expected cartouche in diagnostics'
    );
  }
  if (compass) {
    assert.ok(
      diag.items.some((it) => it.kind === 'compass' || /compass/i.test(it.id)),
      'Expected compass in diagnostics'
    );
  }
}

test('T4-01: Chinese Province Cultural Map (Sichuan / 四川省)', async (t) => {
  const dir = withTempDir(t, 'e2e-t4-sichuan-');
  const sanxingduiSvg = [
    '<svg viewBox="0 0 32 24">',
    '  <path d="M4 6 L28 6 L25 20 L16 23 L7 20 Z" fill="#5e8a72" stroke="#1d1a1e" stroke-width="1.2"/>',
    '  <ellipse cx="11" cy="12" rx="3.5" ry="2.2" fill="#e6c86e" stroke="#1d1a1e"/>',
    '  <ellipse cx="21" cy="12" rx="3.5" ry="2.2" fill="#e6c86e" stroke="#1d1a1e"/>',
    '  <path d="M12 18 Q16 20 20 18" fill="none" stroke="#1d1a1e" stroke-width="1.2"/>',
    '</svg>',
  ].join('\n');

  const specPath = writeSpecFile(dir, 'sichuan.json', {
    schemaVersion: 1,
    meta: { id: 'sichuan-cultural-map', title: '四川省', lang: 'zh', seed: 't4-sichuan-1' },
    canvas: { w: 300, h: 200 },
    geo: {
      fit: { target: { country: 'China', admin1: 'Sichuan' } },
      focus: ['China'],
      admin1: { country: 'China', highlight: ['Sichuan'] },
    },
    layers: {
      graticule: true,
      rivers: { auto: true },
      lakes: { auto: true },
      mountains: { auto: true },
    },
    elements: [
      { id: 'el-panda', type: 'panda', lon: 103.5, lat: 31.0, scale: 1.0, priority: 70 },
      { id: 'el-pavilion', type: 'pavilion', lon: 103.6, lat: 29.6, scale: 0.9, priority: 60 },
      { id: 'el-lantern', type: 'lantern', lon: 104.8, lat: 30.8, scale: 0.9, priority: 55 },
      {
        id: 'el-sanxingdui',
        type: 'svg',
        lon: 104.22,
        lat: 31.0,
        options: { width: 14, fillStyle: 'pencil' },
        svg: sanxingduiSvg,
        priority: 65,
      },
    ],
    labels: [
      { id: 'city-chengdu', text: '成都', subtext: 'Chengdu', lon: 104.06, lat: 30.67, size: 3.4, priority: 95 },
      { id: 'city-chongqing', text: '重庆', subtext: 'Chongqing', lon: 106.55, lat: 29.56, size: 3.0, priority: 85 },
      { id: 'lbl-leshan', text: '乐山', subtext: 'Leshan', lon: 103.76, lat: 29.55, size: 2.6, priority: 60 },
    ],
    cartouche: {
      placement: 'auto',
      w: 78,
      h: 40,
      country: '四川省',
      subtitle: 'Sichuan Cultural Atlas',
      flag: 'CHN',
      capital: '成都 Chengdu',
      language: '汉语',
    },
    compass: { placement: 'auto', r: 7.5 },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.5 },
  });

  const outPng = path.join(dir, 'sichuan.png');
  const outDiag = path.join(dir, 'sichuan.diag.json');
  const res = runCli(['render', specPath, '-o', outPng, '--fast', '--auto-layout', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `T4-01 Sichuan render failed: ${res.stderr}`);

  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 1500);
  assert.equal(ihdr.height, 1000);

  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.equal(diag.overlaps.length, 0, `Sichuan map had overlaps: ${JSON.stringify(diag.overlaps)}`);
  assert.equal(diag.outOfBounds.length, 0, `Sichuan map had OOB: ${JSON.stringify(diag.outOfBounds)}`);
  assertItemsPresent(
    diag,
    ['el-panda', 'el-pavilion', 'el-lantern', 'el-sanxingdui', 'city-chengdu', 'city-chongqing', 'lbl-leshan'],
    { cartouche: true, compass: true }
  );

  const img = await decodePngPixels(outPng);
  for (const id of ['city-chengdu', 'el-sanxingdui', 'el-panda']) {
    const item = diag.items.find((it) => it.id === id);
    assert.ok(item, `Expected ${id} in Sichuan diagnostics`);
    const ink = countInkInBBox(img, item, 5, { padMm: 1.5 });
    assert.ok(ink.nonBgCount > 25, `Expected visible ink for ${id}`);
  }
});

test('T4-02: European Country Cultural Map (Italy)', async (t) => {
  const dir = withTempDir(t, 'e2e-t4-italy-');
  const colosseumSvg = [
    '<svg viewBox="0 0 36 22">',
    '  <rect x="2" y="6" width="32" height="14" rx="2" fill="#e2cba2" stroke="#1d1a1e" stroke-width="1.2"/>',
    '  <path d="M6 20 L6 13 Q9 10 12 13 L12 20 M15 20 L15 13 Q18 10 21 13 L21 20 M24 20 L24 13 Q27 10 30 13 L30 20" fill="#5e4b3c" stroke="#1d1a1e"/>',
    '</svg>',
  ].join('\n');

  const specPath = writeSpecFile(dir, 'italy.json', {
    schemaVersion: 1,
    meta: { id: 'italy-cultural-map', title: 'Italia', lang: 'it', seed: 't4-italy-1' },
    canvas: { w: 300, h: 200 },
    geo: {
      fit: { target: 'Italy' },
      focus: ['Italy'],
      admin1: { country: 'Italy' },
      waterlines: true,
    },
    layers: {
      graticule: true,
      rivers: { auto: true },
      lakes: { auto: true },
      waves: [{ x: 70, y: 145, scale: 1.0, count: 3 }],
    },
    elements: [
      { id: 'el-cathedral', type: 'cathedral', lon: 11.25, lat: 43.77, scale: 0.9, priority: 65 },
      { id: 'el-vineyard', type: 'vineyard', lon: 11.3, lat: 43.3, scale: 0.9, priority: 55 },
      { id: 'el-cheesewine', type: 'cheeseWine', lon: 10.9, lat: 44.6, scale: 0.9, priority: 55 },
      { id: 'el-romanarch', type: 'romanArch', lon: 12.2, lat: 41.6, scale: 0.9, priority: 60 },
      {
        id: 'el-colosseum',
        type: 'svg',
        lon: 12.49,
        lat: 41.89,
        options: { width: 14, fillStyle: 'pencil' },
        svg: colosseumSvg,
        priority: 75,
      },
    ],
    labels: [
      { id: 'lbl-roma', text: 'Roma', lon: 12.496, lat: 41.902, size: 3.4, priority: 95 },
      { id: 'lbl-firenze', text: 'Firenze', lon: 11.255, lat: 43.769, size: 2.8, priority: 80 },
      { id: 'lbl-venezia', text: 'Venezia', lon: 12.315, lat: 45.440, size: 2.8, priority: 80 },
      { id: 'lbl-forli', text: 'Forlì', lon: 12.04, lat: 44.22, size: 2.5, priority: 60 },
    ],
    cartouche: {
      placement: 'auto',
      w: 76,
      h: 38,
      country: 'ITALIA',
      subtitle: 'Cultural Map of Italy',
      flag: 'ITA',
      capital: 'Roma',
    },
    compass: { placement: 'auto', r: 7.5 },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.5 },
  });

  const outPng = path.join(dir, 'italy.png');
  const outDiag = path.join(dir, 'italy.diag.json');
  const res = runCli(['render', specPath, '-o', outPng, '--fast', '--auto-layout', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `T4-02 Italy render failed: ${res.stderr}`);

  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 1500);
  assert.equal(ihdr.height, 1000);

  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.equal(diag.overlaps.length, 0, `Italy map had overlaps: ${JSON.stringify(diag.overlaps)}`);
  assert.equal(diag.outOfBounds.length, 0, `Italy map had OOB: ${JSON.stringify(diag.outOfBounds)}`);
  assertItemsPresent(
    diag,
    [
      'el-cathedral',
      'el-vineyard',
      'el-cheesewine',
      'el-romanarch',
      'el-colosseum',
      'lbl-roma',
      'lbl-firenze',
      'lbl-venezia',
      'lbl-forli',
    ],
    { cartouche: true, compass: true }
  );

  const img = await decodePngPixels(outPng);
  const colItem = diag.items.find((it) => it.id === 'el-colosseum');
  assert.ok(colItem, 'Expected el-colosseum in Italy diagnostics');
  const ink = countInkInBBox(img, colItem, 5, { padMm: 1.5 });
  assert.ok(ink.nonBgCount > 25, 'Expected visible ink for Colosseum SVG');
});

test('T4-03: Bilingual East Asian Regional Map (Japan)', async (t) => {
  const dir = withTempDir(t, 'e2e-t4-japan-');
  const fanSvg = '<svg viewBox="0 0 24 16"><path d="M12 15 L2 5 Q12 0 22 5 Z" fill="#d94e4e" stroke="#1d1a1e"/></svg>';

  const specPath = writeSpecFile(dir, 'japan.json', {
    schemaVersion: 1,
    meta: { id: 'japan-bilingual', title: '日本', lang: 'ja', seed: 't4-japan-1' },
    canvas: { w: 300, h: 200 },
    geo: { fit: { target: 'Japan' }, focus: ['Japan'], waterlines: true },
    layers: {
      graticule: true,
      waves: [
        { x: 60, y: 150, scale: 1.0, count: 3 },
        { x: 230, y: 155, scale: 1.0, count: 2 },
      ],
    },
    elements: [
      { id: 'el-torii', type: 'torii', lon: 135.76, lat: 35.01, scale: 0.9, priority: 65 },
      { id: 'el-sakura', type: 'sakura', lon: 139.69, lat: 35.69, scale: 0.9, priority: 60 },
      { id: 'el-fan', type: 'svg', x: 215, y: 95, options: { width: 12, fillStyle: 'wash' }, svg: fanSvg },
    ],
    labels: [
      { id: 'lbl-tokyo', text: '東京', subtext: 'Tokyo', lon: 139.69, lat: 35.69, size: 3.3, priority: 95 },
      { id: 'lbl-kyoto', text: '京都', subtext: 'Kyoto', lon: 135.76, lat: 35.01, size: 2.9, priority: 85 },
      { id: 'lbl-osaka', text: '大阪', subtext: 'Osaka', lon: 135.50, lat: 34.69, size: 2.8, priority: 80 },
      {
        id: 'lbl-sea-japan',
        kind: 'sea',
        text: '日本海 / Sea of Japan',
        path: [[75, 68], [105, 56], [138, 52], [168, 60]],
        size: 3.1,
        priority: 75,
      },
    ],
    cartouche: {
      placement: 'auto',
      w: 76,
      h: 38,
      country: '日本 JAPAN',
      flag: 'JPN',
      capital: '東京 Tokyo',
    },
    compass: { placement: 'auto', r: 7.5 },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.5 },
  });

  const outPng = path.join(dir, 'japan.png');
  const outDiag = path.join(dir, 'japan.diag.json');
  const res = runCli(['render', specPath, '-o', outPng, '--fast', '--auto-layout', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `T4-03 Japan render failed: ${res.stderr}`);

  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 1500);
  assert.equal(ihdr.height, 1000);

  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.equal(diag.overlaps.length, 0, `Japan map had overlaps: ${JSON.stringify(diag.overlaps)}`);
  assert.equal(diag.outOfBounds.length, 0, `Japan map had OOB: ${JSON.stringify(diag.outOfBounds)}`);
  assertItemsPresent(
    diag,
    ['el-torii', 'el-sakura', 'el-fan', 'lbl-tokyo', 'lbl-kyoto', 'lbl-osaka', 'lbl-sea-japan'],
    { cartouche: true, compass: true }
  );

  const img = await decodePngPixels(outPng);
  const tokyoItem = diag.items.find((it) => it.id === 'lbl-tokyo');
  assert.ok(tokyoItem, 'Expected lbl-tokyo in Japan diagnostics');
  const ink = countInkInBBox(img, tokyoItem, 5, { padMm: 1.5 });
  assert.ok(ink.darkInkCount > 20, 'Expected visible CJK+Latin ink for Tokyo label');
});

test('T4-04: High-Density Crowded Stress-Test Map proves raw overlaps > 0 and --auto-layout resolves to 0', (t) => {
  const dir = withTempDir(t, 'e2e-t4-crowded-');
  const specPath = writeSpecFile(dir, 'crowded.json', {
    schemaVersion: 1,
    meta: { id: 'crowded-stress-test', seed: 't4-crowded-1' },
    canvas: { w: 260, h: 170 },
    geo: { fit: { target: 'Italy' }, focus: ['Italy'] },
    labels: [
      { id: 'c1', text: 'Roma', x: 130, y: 85, size: 3.2, priority: 95 },
      { id: 'c2', text: 'Tivoli', x: 130.5, y: 85.2, size: 2.8, priority: 80 },
      { id: 'c3', text: 'Ostia', x: 129.8, y: 85.4, size: 2.8, priority: 75 },
      { id: 'c4', text: 'Frascati', x: 131.0, y: 84.8, size: 2.7, priority: 70 },
      { id: 'c5', text: 'Viterbo', x: 130.2, y: 86.0, size: 2.7, priority: 65 },
      { id: 'c6', text: 'Velletri', x: 129.5, y: 85.0, size: 2.6, priority: 60 },
      { id: 'c7', text: 'Anzio', x: 130.8, y: 85.5, size: 2.6, priority: 55 },
    ],
  });

  const rawPng = path.join(dir, 'raw.png');
  const rawDiagPath = path.join(dir, 'raw.diag.json');
  const resRaw = runCli(['render', specPath, '-o', rawPng, '--ppm', '4', '--diagnostics', rawDiagPath]);
  assert.equal(resRaw.status, 0, `Raw crowded render failed: ${resRaw.stderr}`);
  const crowdedIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
  const rawDiag = JSON.parse(fs.readFileSync(rawDiagPath, 'utf8'));
  assertDiagnosticsSchema(rawDiag);
  assert.ok(rawDiag.overlaps.length > 0, 'Expected crowded spec WITHOUT auto-layout to have overlaps > 0');
  for (const id of crowdedIds) {
    assert.ok(rawDiag.items.some((it) => it.id === id), `Expected ${id} in raw diagnostics items`);
  }

  const autoPng = path.join(dir, 'auto.png');
  const autoDiagPath = path.join(dir, 'auto.diag.json');
  const resAuto = runCli([
    'render', specPath, '-o', autoPng, '--ppm', '4', '--auto-layout', '--diagnostics', autoDiagPath,
  ]);
  assert.equal(resAuto.status, 0, `Auto-layout crowded render failed: ${resAuto.stderr}`);
  const autoDiag = JSON.parse(fs.readFileSync(autoDiagPath, 'utf8'));
  assertDiagnosticsSchema(autoDiag);
  assert.equal(autoDiag.overlaps.length, 0, `Expected 0 overlaps with --auto-layout, got ${autoDiag.overlaps.length}`);
  assert.equal(autoDiag.outOfBounds.length, 0, 'Expected 0 out-of-bounds items with --auto-layout');
  assert.ok(
    autoDiag.items.length >= rawDiag.items.length,
    `Expected --auto-layout not to drop items (auto=${autoDiag.items.length}, raw=${rawDiag.items.length})`
  );
  for (const id of crowdedIds) {
    const rawItem = rawDiag.items.find((it) => it.id === id);
    const autoItem = autoDiag.items.find((it) => it.id === id);
    assert.ok(autoItem, `Expected --auto-layout to preserve crowded label ${id}`);
    assert.ok(
      autoItem.w >= rawItem.w * 0.8 && autoItem.h >= rawItem.h * 0.8,
      `Expected --auto-layout not to collapse bbox of ${id} (raw=${rawItem.w}x${rawItem.h}, auto=${autoItem.w}x${autoItem.h})`
    );
  }
});

test('T4-05: Multi-Inset / Custom-Palette Thematic Map (Germany)', async (t) => {
  const dir = withTempDir(t, 'e2e-t4-germany-');
  const pretzelSvg = [
    '<svg viewBox="0 0 24 20">',
    '  <path d="M4 14 C2 6 10 2 12 8 C14 2 22 6 20 14 C18 18 12 16 12 12 C12 16 6 18 4 14 Z" fill="#c98842" stroke="#1d1a1e" stroke-width="1.4"/>',
    '</svg>',
  ].join('\n');

  const specPath = writeSpecFile(dir, 'germany.json', {
    schemaVersion: 1,
    meta: { id: 'germany-thematic', title: 'Deutschland', lang: 'de', seed: 't4-germany-1' },
    canvas: { w: 300, h: 200 },
    style: {
      palette: {
        ocean: '#d5e2e0',
        land: '#f6ebd2',
        neighborLand: '#e3dbc8',
      },
    },
    geo: {
      fit: { target: 'Germany' },
      focus: ['Germany'],
      admin1: { country: 'Germany' },
    },
    layers: {
      graticule: true,
      rivers: { auto: true },
      mountains: { auto: true },
      routes: [
        { pts: [[13.40, 52.52], [11.58, 48.13]] },
        { pts: [[9.99, 53.55], [8.68, 50.11]] },
      ],
    },
    elements: [
      { id: 'el-castle', type: 'europeanCastle', lon: 10.75, lat: 47.55, scale: 0.95, priority: 70 },
      { id: 'el-windmill', type: 'windmill', lon: 8.8, lat: 53.1, scale: 0.9, priority: 60 },
      {
        id: 'el-pretzel',
        type: 'svg',
        lon: 11.58,
        lat: 48.13,
        options: { width: 12, fillStyle: 'pencil' },
        svg: pretzelSvg,
        priority: 65,
      },
    ],
    labels: [
      { id: 'lbl-berlin', text: 'Berlin', lon: 13.40, lat: 52.52, size: 3.3, priority: 95 },
      { id: 'lbl-munich', text: 'München', lon: 11.58, lat: 48.13, size: 3.0, priority: 85 },
      { id: 'lbl-hamburg', text: 'Hamburg', lon: 9.99, lat: 53.55, size: 2.9, priority: 80 },
    ],
    insets: [
      { id: 'inset-alps', x: 222, y: 138, w: 64, h: 48, title: 'BAVARIAN ALPS' },
    ],
    cartouche: {
      x: 12,
      y: 12,
      w: 76,
      h: 38,
      country: 'DEUTSCHLAND',
      subtitle: 'Railways & Heritage',
      flag: 'DEU',
      capital: 'Berlin',
    },
    compass: { placement: 'auto', r: 7.5 },
    layout: { autoPlace: true, avoidOverlap: true, padding: 1.5 },
  });

  const outPng = path.join(dir, 'germany.png');
  const outDiag = path.join(dir, 'germany.diag.json');
  const res = runCli(['render', specPath, '-o', outPng, '--fast', '--auto-layout', '--diagnostics', outDiag]);
  assert.equal(res.status, 0, `T4-05 Germany render failed: ${res.stderr}`);

  const ihdr = parsePngIhdr(outPng);
  assert.equal(ihdr.width, 1500);
  assert.equal(ihdr.height, 1000);

  const diag = JSON.parse(fs.readFileSync(outDiag, 'utf8'));
  assertDiagnosticsSchema(diag);
  assert.equal(diag.overlaps.length, 0, `Germany map had overlaps: ${JSON.stringify(diag.overlaps)}`);
  assert.equal(diag.outOfBounds.length, 0, `Germany map had OOB: ${JSON.stringify(diag.outOfBounds)}`);
  assertItemsPresent(
    diag,
    ['el-castle', 'el-windmill', 'el-pretzel', 'lbl-berlin', 'lbl-munich', 'lbl-hamburg'],
    { cartouche: true, compass: true }
  );

  const img = await decodePngPixels(outPng);
  const insetInk = countInkInBBox(img, { x: 222, y: 138, w: 64, h: 48 }, 5);
  const cartInk = countInkInBBox(img, { x: 12, y: 12, w: 76, h: 38 }, 5);
  assert.ok(insetInk.darkInkCount > 50, 'Expected visible ink in Bavarian Alps inset box');
  assert.ok(cartInk.darkInkCount > 100, 'Expected visible ink in Germany cartouche');
});
